import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "./assets/3d/aicee_final1.glb";
const stage = document.getElementById("aicee-3d-stage");
const loaderBox = document.getElementById("aicee-3d-loader");
const loaderText = document.getElementById("aicee-3d-loader-text");

const api = {
    ready: false,
    clips: [],
    isReady: () => api.ready,
    turnAway: () => {},
    turnBack: () => {},
    sad: () => {},
    success: () => {},
    reset: () => {},
    setBusy: () => {}
};

window.AIcee3D = api;

if (!stage) {
    console.warn("AIcee 3D stage was not found.");
} else {
    initAicee3D();
}

function initAicee3D() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 1.75)
    );

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    stage.appendChild(renderer.domElement);

    /* =========================
       LIGHTING
    ========================= */

    const hemisphere = new THREE.HemisphereLight(
        0xeaf4ff,
        0x1b2440,
        2.4
    );

    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(
        0xffffff,
        3.1
    );

    keyLight.position.set(3.5, 6, 5);
    keyLight.castShadow = true;

    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
        0x7dd3fc,
        2.0
    );

    rimLight.position.set(-4, 3, -3);

    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(
        0x818cf8,
        1.0
    );

    fillLight.position.set(-3, 1, 4);

    scene.add(fillLight);

    /* =========================
       MODEL / ANIMATION
    ========================= */

    const clock = new THREE.Clock();

    const modelAnchor = new THREE.Group();
    scene.add(modelAnchor);

    let model = null;
    let mixer = null;
    let headBone = null;

    let actions = {};
    let currentAction = null;

    let currentState = "loading";
    let busy = false;

    let pointerYaw = 0;
    let pointerPitch = 0;

    let smoothYaw = 0;
    let smoothPitch = 0;

    const gltfLoader = new GLTFLoader();

    gltfLoader.load(
        MODEL_URL,

        gltf => {
            model = gltf.scene;

            modelAnchor.add(model);

            model.traverse(object => {
                if (object.isMesh) {
                    object.castShadow = true;
                    object.receiveShadow = true;

                    /*
                     Prevent parts of the animated model
                     from disappearing because of frustum
                     calculations.
                    */
                    object.frustumCulled = false;
                }

                /*
                 Try to find AIcee's head bone.
                */
                if (
                    object.isBone &&
                    /(^|:)Head$/i.test(object.name)
                ) {
                    headBone = object;
                }
            });

            /* =========================
               MODEL SCALE / POSITION
            ========================= */

            normalizeModel(model);

            /*
             IMPORTANT:
             Fit the camera after the model has
             been normalized.
            */
            fitCameraToModel(
                camera,
                modelAnchor
            );

            /* =========================
               ANIMATIONS
            ========================= */

            mixer = new THREE.AnimationMixer(model);

            api.clips = gltf.animations.map(
                clip => clip.name
            );

            const clipBy = (...aliases) => {
                const normalizedAliases = aliases.map(
                    value =>
                        String(value).toLowerCase()
                );

                return (
                    gltf.animations.find(clip =>
                        normalizedAliases.includes(
                            String(
                                clip.name
                            ).toLowerCase()
                        )
                    ) ||

                    gltf.animations.find(clip =>
                        normalizedAliases.some(
                            alias =>
                                String(
                                    clip.name
                                )
                                    .toLowerCase()
                                    .includes(alias)
                        )
                    )
                );
            };

            const idleClip =
                clipBy(
                    "Idle",
                    "idle"
                ) ||
                gltf.animations[0];

            const sadClip =
                clipBy(
                    "sad",
                    "error",
                    "wrong",
                    "defeat"
                );

            const turnClip =
                clipBy(
                    "turning",
                    "turnaway",
                    "turn away",
                    "turn"
                );

            const successClip =
                clipBy(
                    "Success",
                    "success",
                    "wave",
                    "agree",
                    "happy",
                    "celebrate"
                ) ||

                gltf.animations.find(
                    clip =>
                        clip !== idleClip &&
                        clip !== sadClip &&
                        clip !== turnClip
                );

            actions = {
                idle:
                    idleClip
                        ? mixer.clipAction(
                              idleClip
                          )
                        : null,

                sad:
                    sadClip
                        ? mixer.clipAction(
                              sadClip
                          )
                        : null,

                turn:
                    turnClip
                        ? mixer.clipAction(
                              turnClip
                          )
                        : null,

                success:
                    successClip
                        ? mixer.clipAction(
                              successClip
                          )
                        : null
            };

            mixer.addEventListener(
                "finished",
                event => {

                    if (
                        event.action ===
                        actions.turn
                    ) {
                        if (
                            currentState ===
                            "turning-back"
                        ) {
                            playIdle();
                        } else if (
                            currentState ===
                            "turning-away"
                        ) {
                            currentState =
                                "turned";
                        }

                        return;
                    }

                    if (
                        event.action ===
                        actions.sad
                    ) {
                        playIdle();
                    }
                }
            );

            /* =========================
               PUBLIC API
            ========================= */

            api.turnAway = turnAway;
            api.turnBack = turnBack;
            api.sad = playSad;
            api.success = playSuccess;
            api.reset = resetMascot;
            api.setBusy = setBusy;

            api.ready = true;

            playIdle();

            hideLoader();

            console.log(
                "🐱 AIcee 3D ready. Animation clips:",
                api.clips
            );
        },

        /* =========================
           LOADING PROGRESS
        ========================= */

        xhr => {
            if (
                !loaderText ||
                !xhr.total
            ) {
                return;
            }

            const percent =
                Math.min(
                    100,
                    Math.round(
                        (xhr.loaded /
                            xhr.total) *
                            100
                    )
                );

            loaderText.textContent =
                `Loading AIcee in 3D… ${percent}%`;
        },

        /* =========================
           LOAD ERROR
        ========================= */

        error => {
            console.error(
                "AIcee 3D model failed to load:",
                error
            );

            if (loaderText) {
                loaderText.textContent =
                    "AIcee 3D could not load";
            }
        }
    );

    /* =========================
       ANIMATION HELPERS
    ========================= */

    function stopActions(
        except = null
    ) {
        Object.values(
            actions
        ).forEach(action => {

            if (
                action &&
                action !== except
            ) {
                action.stop();
            }
        });
    }

    function startAction(
        action,
        {
            loop = true,
            clamp = false,
            timeScale = 1,
            time = 0,
            fade = 0.18
        } = {}
    ) {
        if (
            !action ||
            !mixer
        ) {
            return false;
        }

        const previous =
            currentAction;

        stopActions(action);

        action.enabled = true;
        action.paused = false;

        action.clampWhenFinished =
            clamp;

        action.setLoop(
            loop
                ? THREE.LoopRepeat
                : THREE.LoopOnce,

            loop
                ? Infinity
                : 1
        );

        action.setEffectiveWeight(
            1
        );

        action.setEffectiveTimeScale(
            timeScale
        );

        action.time =
            THREE.MathUtils.clamp(
                time,
                0,
                action.getClip()
                    .duration
            );

        if (
            previous &&
            previous !== action &&
            previous.isRunning()
        ) {
            previous.fadeOut(
                fade
            );

            action.fadeIn(
                fade
            );
        }

        action.play();

        currentAction =
            action;

        return true;
    }

    /* =========================
       IDLE
    ========================= */

    function playIdle() {
        currentState =
            busy
                ? "busy"
                : "idle";

        if (
            !actions.idle
        ) {
            return;
        }

        startAction(
            actions.idle,
            {
                loop: true,
                clamp: false,
                timeScale:
                    busy
                        ? 0.72
                        : 1
            }
        );
    }

    /* =========================
       TURN AWAY
    ========================= */

    function turnAway() {
        if (
            !actions.turn ||
            currentState ===
                "turned" ||
            currentState ===
                "turning-away"
        ) {
            return;
        }

        const resumeTime =
            currentState ===
            "turning-back"
                ? actions.turn.time
                : 0;

        currentState =
            "turning-away";

        startAction(
            actions.turn,
            {
                loop: false,
                clamp: true,
                timeScale: 1,
                time: resumeTime,
                fade: 0.12
            }
        );
    }

    /* =========================
       TURN BACK
    ========================= */

    function turnBack() {
        if (
            !actions.turn
        ) {
            playIdle();
            return;
        }

        if (
            currentState ===
                "idle" ||
            currentState ===
                "busy" ||
            currentState ===
                "turning-back"
        ) {
            return;
        }

        const clipDuration =
            actions.turn
                .getClip()
                .duration;

        const resumeTime =
            currentState ===
            "turning-away"
                ? Math.max(
                      actions.turn.time,
                      0.001
                  )
                : clipDuration;

        currentState =
            "turning-back";

        startAction(
            actions.turn,
            {
                loop: false,
                clamp: true,
                timeScale: -1,
                time: resumeTime,
                fade: 0.1
            }
        );
    }

    /* =========================
       SAD ANIMATION
    ========================= */

    function playSad() {
        busy = false;

        if (
            !actions.sad
        ) {
            playIdle();
            return;
        }

        currentState =
            "sad";

        startAction(
            actions.sad,
            {
                loop: false,
                clamp: false,
                timeScale: 1,
                time: 0
            }
        );
    }

    /* =========================
       SUCCESS ANIMATION
    ========================= */

    function playSuccess() {
        busy = false;

        if (
            !actions.success
        ) {
            return;
        }

        currentState =
            "success";

        startAction(
            actions.success,
            {
                loop: false,
                clamp: true,
                timeScale: 1,
                time: 0
            }
        );
    }

    function resetMascot() {
        busy = false;
        playIdle();
    }

    function setBusy(
        value
    ) {
        busy =
            Boolean(value);

        if (
            currentState ===
                "idle" ||
            currentState ===
                "busy"
        ) {
            playIdle();
        }
    }

    /* =====================================================
       NORMALIZE MODEL
       ===================================================== */

    function normalizeModel(
        root
    ) {
        let box =
            new THREE.Box3()
                .setFromObject(
                    root
                );

        let size =
            box.getSize(
                new THREE.Vector3()
            );

        if (
            !Number.isFinite(
                size.y
            ) ||
            size.y <= 0
        ) {
            return;
        }

        /*
         Keep AIcee at one predictable
         world-space height.
        */

        const desiredHeight =
            4.8;

        const scale =
            desiredHeight /
            size.y;

        root.scale.multiplyScalar(
            scale
        );

        root.updateMatrixWorld(
            true
        );

        box =
            new THREE.Box3()
                .setFromObject(
                    root
                );

        const center =
            box.getCenter(
                new THREE.Vector3()
            );

        /*
         Center AIcee horizontally.
        */

        root.position.x -=
            center.x;

        root.position.z -=
            center.z;

        /*
         Put his feet on Y = 0.
        */

        root.position.y -=
            box.min.y;

        root.updateMatrixWorld(
            true
        );
    }

    /* =====================================================
       CAMERA FIX
       ===================================================== */

    function fitCameraToModel(
        targetCamera,
        root
    ) {
        const box =
            new THREE.Box3()
                .setFromObject(
                    root
                );

        const size =
            box.getSize(
                new THREE.Vector3()
            );

        const center =
            box.getCenter(
                new THREE.Vector3()
            );

        const fov =
            THREE.MathUtils.degToRad(
                targetCamera.fov
            );

        /*
         IMPORTANT FIX:

         The GLB has an animated head
         and ears.

         The normal bounding box can
         underestimate how high the
         head/ears can move during
         animation.

         This creates deliberate
         headroom so the top of AIcee
         never gets cropped.
        */

        const fullHeightDistance =
            size.y /
            (
                2 *
                Math.tan(
                    fov / 2
                )
            );

        const aspect =
            stage.clientWidth /
            Math.max(
                stage.clientHeight,
                1
            );

        /*
         Narrow stages need even more
         camera distance because AIcee
         has wide ears/head.
        */

        const aspectBoost =
            aspect < 0.68
                ? 1.18
                : aspect < 0.82
                ? 1.12
                : 1.08;

        /*
         Extra safety margin.

         The original value was too
         close, causing AIcee's head
         to be cropped.

         1.34 gives more breathing room.
        */

        const distance =
            fullHeightDistance *
                1.34 *
                aspectBoost +
            size.z *
                0.24;

        /*
         Move camera aim slightly higher.

         This makes AIcee sit a little
         lower inside the canvas, giving
         extra space above the ears.
        */

        const verticalOffset =
            size.y *
            0.23;

        const cameraY =
            center.y +
            verticalOffset;

        targetCamera.position.set(
            center.x,
            cameraY,
            distance
        );

        targetCamera.lookAt(
            center.x,
            cameraY,
            center.z
        );

        targetCamera.near =
            Math.max(
                0.01,
                distance /
                    150
            );

        targetCamera.far =
            distance *
            14;

        targetCamera.updateProjectionMatrix();
    }

    /* =========================
       RESPONSIVE RESIZE
    ========================= */

    function resize() {
        const width =
            Math.max(
                stage.clientWidth,
                1
            );

        const height =
            Math.max(
                stage.clientHeight,
                1
            );

        renderer.setSize(
            width,
            height,
            false
        );

        camera.aspect =
            width /
            height;

        camera.updateProjectionMatrix();

        /*
         Recalculate framing whenever
         the container changes size.
        */

        if (model) {
            fitCameraToModel(
                camera,
                modelAnchor
            );
        }
    }

    const resizeObserver =
        new ResizeObserver(
            resize
        );

    resizeObserver.observe(
        stage
    );

    resize();

    /* =========================
       HEAD FOLLOW MOUSE
    ========================= */

    window.addEventListener(
        "pointermove",
        event => {

            if (
                !api.ready
            ) {
                return;
            }

            const nx =
                (
                    event.clientX /
                    Math.max(
                        window.innerWidth,
                        1
                    )
                ) *
                    2 -
                1;

            const ny =
                (
                    event.clientY /
                    Math.max(
                        window.innerHeight,
                        1
                    )
                ) *
                    2 -
                1;

            pointerYaw =
                THREE.MathUtils.clamp(
                    nx *
                        0.22,
                    -0.22,
                    0.22
                );

            pointerPitch =
                THREE.MathUtils.clamp(
                    -ny *
                        0.10,
                    -0.10,
                    0.10
                );
        },
        {
            passive: true
        }
    );

    document.addEventListener(
        "mouseleave",
        () => {
            pointerYaw = 0;
            pointerPitch = 0;
        }
    );

    /* =========================
       RENDER LOOP
    ========================= */

    function animate() {
        requestAnimationFrame(
            animate
        );

        const delta =
            Math.min(
                clock.getDelta(),
                0.05
            );

        if (
            mixer
        ) {
            mixer.update(
                delta
            );
        }

        const canTrack =
            headBone &&
            (
                currentState ===
                    "idle" ||
                currentState ===
                    "busy"
            );

        smoothYaw =
            THREE.MathUtils.lerp(
                smoothYaw,
                canTrack
                    ? pointerYaw
                    : 0,
                0.075
            );

        smoothPitch =
            THREE.MathUtils.lerp(
                smoothPitch,
                canTrack
                    ? pointerPitch
                    : 0,
                0.075
            );

        /*
         Head follow effect.
        */

        if (
            canTrack
        ) {
            const offset =
                new THREE.Quaternion()
                    .setFromEuler(
                        new THREE.Euler(
                            smoothPitch,
                            smoothYaw,
                            0,
                            "XYZ"
                        )
                    );

            headBone.quaternion.multiply(
                offset
            );
        }

        renderer.render(
            scene,
            camera
        );
    }

    animate();
}

/* =========================
   REMOVE LOADING MESSAGE
========================= */

function hideLoader() {
    if (
        !loaderBox
    ) {
        return;
    }

    loaderBox.classList.add(
        "is-hidden"
    );

    setTimeout(
        () =>
            loaderBox.remove(),
        360
    );
}
