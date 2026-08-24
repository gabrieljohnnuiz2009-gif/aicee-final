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
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(0xeaf4ff, 0x1b2440, 2.4);
    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(3.5, 6, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 2.0);
    rimLight.position.set(-4, 3, -3);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x818cf8, 1.0);
    fillLight.position.set(-3, 1, 4);
    scene.add(fillLight);

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
                    object.frustumCulled = false;
                }
                if (object.isBone && /(^|:)Head$/i.test(object.name)) {
                    headBone = object;
                }
            });

            normalizeModel(model);
            fitCameraToModel(camera, modelAnchor);

            mixer = new THREE.AnimationMixer(model);
            api.clips = gltf.animations.map(clip => clip.name);

            const clipBy = (...aliases) => {
                const normalizedAliases = aliases.map(value => String(value).toLowerCase());
                return gltf.animations.find(clip =>
                    normalizedAliases.includes(String(clip.name).toLowerCase())
                ) || gltf.animations.find(clip =>
                    normalizedAliases.some(alias => String(clip.name).toLowerCase().includes(alias))
                );
            };

            const idleClip = clipBy("Idle", "idle") || gltf.animations[0];
            const sadClip = clipBy("sad", "error", "wrong", "defeat");
            const turnClip = clipBy("turning", "turnaway", "turn away", "turn");
            const successClip = clipBy("Success", "success", "wave", "agree", "happy", "celebrate") ||
                gltf.animations.find(clip => clip !== idleClip && clip !== sadClip && clip !== turnClip);

            actions = {
                idle: idleClip ? mixer.clipAction(idleClip) : null,
                sad: sadClip ? mixer.clipAction(sadClip) : null,
                turn: turnClip ? mixer.clipAction(turnClip) : null,
                success: successClip ? mixer.clipAction(successClip) : null
            };

            mixer.addEventListener("finished", event => {
                if (event.action === actions.turn) {
                    if (currentState === "turning-back") {
                        playIdle();
                    } else if (currentState === "turning-away") {
                        currentState = "turned";
                    }
                    return;
                }

                if (event.action === actions.sad) {
                    playIdle();
                }
            });

            api.turnAway = turnAway;
            api.turnBack = turnBack;
            api.sad = playSad;
            api.success = playSuccess;
            api.reset = resetMascot;
            api.setBusy = setBusy;
            api.ready = true;

            playIdle();
            hideLoader();

            console.log("🐱 AIcee 3D ready. Animation clips:", api.clips);
        },
        xhr => {
            if (!loaderText || !xhr.total) return;
            const percent = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
            loaderText.textContent = `Loading AIcee in 3D… ${percent}%`;
        },
        error => {
            console.error("AIcee 3D model failed to load:", error);
            if (loaderText) loaderText.textContent = "AIcee 3D could not load";
        }
    );

    function stopActions(except = null) {
        Object.values(actions).forEach(action => {
            if (action && action !== except) action.stop();
        });
    }

    function startAction(action, { loop = true, clamp = false, timeScale = 1, time = 0, fade = 0.18 } = {}) {
        if (!action || !mixer) return false;

        const previous = currentAction;
        stopActions(action);

        action.enabled = true;
        action.paused = false;
        action.clampWhenFinished = clamp;
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.setEffectiveWeight(1);
        action.setEffectiveTimeScale(timeScale);
        action.time = THREE.MathUtils.clamp(time, 0, action.getClip().duration);

        if (previous && previous !== action && previous.isRunning()) {
            previous.fadeOut(fade);
            action.fadeIn(fade);
        }

        action.play();
        currentAction = action;
        return true;
    }

    function playIdle() {
        currentState = busy ? "busy" : "idle";
        if (!actions.idle) return;
        startAction(actions.idle, { loop: true, clamp: false, timeScale: busy ? 0.72 : 1 });
    }

    function turnAway() {
        if (!actions.turn || currentState === "turned" || currentState === "turning-away") return;

        const resumeTime = currentState === "turning-back"
            ? actions.turn.time
            : 0;

        currentState = "turning-away";
        startAction(actions.turn, {
            loop: false,
            clamp: true,
            timeScale: 1,
            time: resumeTime,
            fade: 0.12
        });
    }

    function turnBack() {
        if (!actions.turn) {
            playIdle();
            return;
        }
        if (currentState === "idle" || currentState === "busy" || currentState === "turning-back") return;

        const clipDuration = actions.turn.getClip().duration;
        const resumeTime = currentState === "turning-away"
            ? Math.max(actions.turn.time, 0.001)
            : clipDuration;

        currentState = "turning-back";
        startAction(actions.turn, {
            loop: false,
            clamp: true,
            timeScale: -1,
            time: resumeTime,
            fade: 0.1
        });
    }

    function playSad() {
        busy = false;
        if (!actions.sad) {
            playIdle();
            return;
        }
        currentState = "sad";
        startAction(actions.sad, { loop: false, clamp: false, timeScale: 1, time: 0 });
    }

    function playSuccess() {
        busy = false;
        if (!actions.success) return;
        currentState = "success";
        startAction(actions.success, { loop: false, clamp: true, timeScale: 1, time: 0 });
    }

    function resetMascot() {
        busy = false;
        playIdle();
    }

    function setBusy(value) {
        busy = Boolean(value);
        if (currentState === "idle" || currentState === "busy") {
            playIdle();
        }
    }

    function normalizeModel(root) {
        let box = new THREE.Box3().setFromObject(root);
        let size = box.getSize(new THREE.Vector3());
        if (!Number.isFinite(size.y) || size.y <= 0) return;

        // Keep one predictable world-space size so animation and camera framing stay stable.
        const desiredHeight = 4.8;
        const scale = desiredHeight / size.y;
        root.scale.multiplyScalar(scale);
        root.updateMatrixWorld(true);

        box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        root.position.x -= center.x;
        root.position.z -= center.z;
        root.position.y -= box.min.y;
        root.updateMatrixWorld(true);
    }

    function fitCameraToModel(targetCamera, root) {
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        if (
            !Number.isFinite(size.x) ||
            !Number.isFinite(size.y) ||
            size.x <= 0 ||
            size.y <= 0
        ) {
            return;
        }

        const stageWidth = Math.max(stage.clientWidth, 1);
        const stageHeight = Math.max(stage.clientHeight, 1);
        const aspect = stageWidth / stageHeight;

        const verticalFov = THREE.MathUtils.degToRad(targetCamera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);

        // Fit against BOTH axes. The old version only fitted the static height,
        // which could still crop the animated/skinned head on narrow stages.
        const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2));
        const distanceForWidth = size.x / (2 * Math.tan(Math.max(horizontalFov, 0.01) / 2));
        const baseDistance = Math.max(distanceForHeight, distanceForWidth);

        // Animation-safe framing. Narrow/tall stages receive a little more room.
        const safetyScale = aspect < 0.72 ? 1.42 : aspect < 0.90 ? 1.36 : 1.31;
        const distance = baseDistance * safetyScale + size.z * 0.24;

        // Looking slightly above the static center places AIcee lower in frame,
        // leaving extra visible space above the animated head/ears/hair.
        const verticalOffset = size.y * (aspect < 0.72 ? 0.23 : 0.20);
        const cameraY = center.y + verticalOffset;

        targetCamera.position.set(center.x, cameraY, distance);
        targetCamera.lookAt(center.x, cameraY, center.z);

        targetCamera.near = Math.max(0.01, distance / 150);
        targetCamera.far = Math.max(100, distance * 14);
        targetCamera.updateProjectionMatrix();
    }

    function resize() {
        const width = Math.max(stage.clientWidth, 1);
        const height = Math.max(stage.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (model) fitCameraToModel(camera, modelAnchor);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resize();

    window.addEventListener("pointermove", event => {
        if (!api.ready) return;
        const nx = (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
        const ny = (event.clientY / Math.max(window.innerHeight, 1)) * 2 - 1;
        pointerYaw = THREE.MathUtils.clamp(nx * 0.22, -0.22, 0.22);
        pointerPitch = THREE.MathUtils.clamp(-ny * 0.10, -0.10, 0.10);
    }, { passive: true });

    document.addEventListener("mouseleave", () => {
        pointerYaw = 0;
        pointerPitch = 0;
    });

    function animate() {
        requestAnimationFrame(animate);
        const delta = Math.min(clock.getDelta(), 0.05);

        if (mixer) mixer.update(delta);

        const canTrack = headBone && (currentState === "idle" || currentState === "busy");
        smoothYaw = THREE.MathUtils.lerp(smoothYaw, canTrack ? pointerYaw : 0, 0.075);
        smoothPitch = THREE.MathUtils.lerp(smoothPitch, canTrack ? pointerPitch : 0, 0.075);

        // Apply a small post-animation head offset. The mixer writes the base pose first each frame.
        if (canTrack) {
            const offset = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(smoothPitch, smoothYaw, 0, "XYZ")
            );
            headBone.quaternion.multiply(offset);
        }

        renderer.render(scene, camera);
    }

    animate();
}

function hideLoader() {
    if (!loaderBox) return;
    loaderBox.classList.add("is-hidden");
    setTimeout(() => loaderBox.remove(), 360);
}
