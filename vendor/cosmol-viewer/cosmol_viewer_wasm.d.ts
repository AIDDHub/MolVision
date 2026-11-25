/* tslint:disable */
/* eslint-disable */
export type BoolInput = boolean;

export type ByteInput = number;

export type BytesInput = Uint8Array;

export type DoubleInput = number;

export type FloatArrayInput = Float32Array;

export type FloatInput = number;

export type I16Input = number;

export type I32Input = number;

export type I8Input = number;

export type IndexArrayInput = number[];

export type IndexInput = number;

export type IntegerInput = bigint;

export type SignedIndexInput = number;

export type TextInput = string;

export type U16Input = number;

export type U32ArrayInput = number[];

export type U32Input = number;

export type UnsignedIntegerInput = bigint;


/**
 * Reusable animation state. Added frames are scene snapshots, matching core behavior.
 */
export class Animation {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    addFrame(scene: Scene): void;
    frameCount(): number;
    static new(interval: FloatInput, loops: IntegerInput, interpolate: BoolInput): Animation;
    setInterpolate(interpolate: BoolInput): void;
    setInterval(interval: FloatInput): void;
    setLoops(loops: IntegerInput): void;
    setStaticScene(scene: Scene): void;
    toJson(): string;
}

export class Mesh {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cloneShape(): Mesh;
    static new(vertices: FloatArrayInput, indices: U32ArrayInput, normals: FloatArrayInput, colors: BytesInput): Mesh;
}

/**
 * Reusable scene state. Cloned binding handles refer to the same scene.
 */
export class Scene {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    add(item: import("@cosmol-studio/cosmolkit").Molecule | import("@cosmol-studio/cosmolkit").Protein | Selection | Sphere | Stick | Mesh, style?: Style | null): void;
    /**
     * Explicitly copy scene display state into an independent scene.
     */
    cloneScene(): Scene;
    mergeShapes(other: Scene): void;
    static new(): Scene;
    recenterOn(source: import("@cosmol-studio/cosmolkit").Molecule | import("@cosmol-studio/cosmolkit").Protein): void;
    recenter(center: FloatArrayInput): void;
    removeShape(id: TextInput): void;
    rotateCamera(azimuth_delta: FloatInput, elevation_delta: FloatInput, roll_delta: FloatInput): void;
    setAmbientLight(intensity: FloatInput): void;
    setAutoRotate(enabled: BoolInput, speed: FloatInput): void;
    /**
     * RGB components are bytes in the range 0..255.
     */
    setBackgroundColor(color: BytesInput): void;
    setCameraDistance(distance: FloatInput): void;
    setCameraFov(fov: FloatInput): void;
    setCameraTarget(target: FloatArrayInput): void;
    setCameraView(azimuth: FloatInput, elevation: FloatInput, roll: FloatInput, distance: FloatInput, target: FloatArrayInput, fov: FloatInput): void;
    setDepthCueColor(color: BytesInput): void;
    setDepthCueRange(start: FloatInput, end: FloatInput): void;
    setDepthCue(enabled: BoolInput): void;
    setLightColor(color: BytesInput): void;
    setLightIntensity(intensity: FloatInput): void;
    setLighting(ambient: FloatInput, diffuse: FloatInput, specular: FloatInput, intensity: FloatInput, color: BytesInput): void;
    setOutlineEnabled(enabled: BoolInput): void;
    setOutlineStrength(strength: FloatInput): void;
    setScale(scale: FloatInput): void;
    setSsaoEnabled(enabled: BoolInput): void;
    setSsaoStrength(strength: FloatInput): void;
    setTransparentBackground(enabled: BoolInput): void;
    setZoomDisabled(disabled: BoolInput): void;
    set(name: TextInput, item: import("@cosmol-studio/cosmolkit").Molecule | import("@cosmol-studio/cosmolkit").Protein | Selection | Sphere | Stick | Mesh, style?: Style | null): void;
    shapeCount(): number;
    /**
     * Inspect display state; this serialization is not needed for render/update.
     */
    toJson(): string;
    useBlackBackground(): void;
}

export class Selection {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    aromatic(): Selection;
    /**
     * Copy the selection handle while sharing the same imported source.
     */
    cloneSelection(): Selection;
    /**
     * Remove a selection of the same kind from the same source.
     */
    difference(other: Selection): Selection;
    element(element: import("@cosmol-studio/cosmolkit").Element): Selection;
    /**
     * Keep only these zero-based source IDs, preserving source order.
     */
    filterIds(ids: IndexArrayInput): Selection;
    ids(): Uint32Array;
    len(): number;
    /**
     * Keep atoms in zero-based CK residue IDs, not PDB sequence numbers.
     */
    residueIds(ids: U32ArrayInput): Selection;
    /**
     * Select side-chain heavy atoms; excludes H and N, CA, C, O, OXT.
     */
    sidechain(): Selection;
}

export class Selector {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    atoms(): Selection;
    bonds(): Selection;
    residues(): Selection;
}

export class Sphere {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cloneShape(): Sphere;
    color(rgb: BytesInput): Sphere;
    static new(center: FloatArrayInput, radius: FloatInput): Sphere;
    opacity(opacity: FloatInput): Sphere;
}

export class Stick {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cloneShape(): Stick;
    color(rgb: BytesInput): Stick;
    static new(start: FloatArrayInput, end: FloatArrayInput, radius: FloatInput): Stick;
    opacity(opacity: FloatInput): Stick;
}

export class Style {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static ballAndStick(): Style;
    static cartoon(): Style;
    cloneStyle(): Style;
    color(rgb: BytesInput): Style;
    configureSurface(probe_radius: FloatInput, grid_spacing: FloatInput, solvent_accessible: BoolInput, sharp_boundaries: BoolInput): Style;
    conformer(id: IndexInput): Style;
    coordinates2d(): Style;
    metallic(value: FloatInput): Style;
    opacity(value: FloatInput): Style;
    outline(rgb: BytesInput, width: FloatInput): Style;
    rainbowResidues(): Style;
    roughness(value: FloatInput): Style;
    scale(value: FloatInput): Style;
    static sphere(): Style;
    static stick(): Style;
    static surface(): Style;
}

/**
 * A browser renderer. Scene and animation arguments are typed, reusable handles.
 */
export class Viewer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cameraParameterLogging(enabled: BoolInput): void;
    /**
     * Latest live camera published by the renderer:
     * `[azimuth, elevation, roll, distance, target.x, target.y, target.z, fov]`.
     * Empty until the first frame has been painted.
     */
    cameraState(): Float32Array;
    /**
     * Stop rendering and release renderer resources. The caller-owned canvas remains.
     */
    close(): void;
    /**
     * Internal one-way notebook command ingress. Ordinary JS callers use update directly.
     */
    dispatch(payload: TextInput): void;
    /**
     * Bind a viewer to an existing canvas ID without starting rendering.
     * The caller owns canvas placement and dimensions.
     */
    static new(canvas_id: TextInput): Viewer;
    /**
     * Internal notebook startup: payload is not the public JS scene API.
     */
    static openNotebook(canvas_id: TextInput, payload: TextInput): Promise<Viewer>;
    /**
     * Internal notebook animation startup, accepting the versioned transport envelope.
     */
    static playNotebook(canvas_id: TextInput, payload: TextInput): Promise<Viewer>;
    /**
     * Play an animation on this viewer's canvas, replacing previous content.
     */
    play(animation: Animation): Promise<void>;
    /**
     * Render a scene on this viewer's canvas, stopping any previous animation.
     * First use starts the renderer; subsequent calls queue a new scene.
     */
    render(scene: Scene): Promise<void>;
    /**
     * Show live camera parameters over the viewport, independently of logging.
     */
    showCameraParameters(enabled: BoolInput): void;
    /**
     * Show renderer FPS. One diagnostic repaint shows zero after one second idle,
     * without counting that repaint or renewing the idle timer.
     */
    showFps(enabled: BoolInput): void;
    /**
     * Return PNG bytes to JavaScript. Notebook response transport is not supported.
     */
    takeScreenshot(): Promise<Uint8Array>;
    /**
     * Queue a typed scene update. The renderer applies it on a subsequent frame.
     */
    update(scene: Scene): void;
}

export function __setCkTypes(molecule: Function, protein: Function, element: Function): void;

export function __setViewerTypes(selection: Function, sphere: Function, stick: Function, mesh: Function, style: Function): void;

export function bindingContractJson(): string;

export function select(source: import("@cosmol-studio/cosmolkit").Molecule | import("@cosmol-studio/cosmolkit").Protein): Selector;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __setCkTypes: (a: number, b: number, c: number) => void;
    readonly __setViewerTypes: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly __wbg_animation_free: (a: number, b: number) => void;
    readonly __wbg_mesh_free: (a: number, b: number) => void;
    readonly __wbg_scene_free: (a: number, b: number) => void;
    readonly __wbg_selection_free: (a: number, b: number) => void;
    readonly __wbg_selector_free: (a: number, b: number) => void;
    readonly __wbg_sphere_free: (a: number, b: number) => void;
    readonly __wbg_stick_free: (a: number, b: number) => void;
    readonly __wbg_style_free: (a: number, b: number) => void;
    readonly __wbg_viewer_free: (a: number, b: number) => void;
    readonly animation_addFrame: (a: number, b: number, c: number) => void;
    readonly animation_frameCount: (a: number, b: number) => void;
    readonly animation_new: (a: number, b: number, c: number, d: number) => void;
    readonly animation_setInterpolate: (a: number, b: number, c: number) => void;
    readonly animation_setInterval: (a: number, b: number, c: number) => void;
    readonly animation_setLoops: (a: number, b: number, c: number) => void;
    readonly animation_setStaticScene: (a: number, b: number, c: number) => void;
    readonly animation_toJson: (a: number, b: number) => void;
    readonly bindingContractJson: (a: number) => void;
    readonly mesh_cloneShape: (a: number, b: number) => void;
    readonly mesh_new: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly scene_add: (a: number, b: number, c: number, d: number) => void;
    readonly scene_cloneScene: (a: number, b: number) => void;
    readonly scene_mergeShapes: (a: number, b: number, c: number) => void;
    readonly scene_new: (a: number) => void;
    readonly scene_recenter: (a: number, b: number, c: number) => void;
    readonly scene_recenterOn: (a: number, b: number, c: number) => void;
    readonly scene_removeShape: (a: number, b: number, c: number) => void;
    readonly scene_rotateCamera: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly scene_set: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly scene_setAmbientLight: (a: number, b: number, c: number) => void;
    readonly scene_setAutoRotate: (a: number, b: number, c: number, d: number) => void;
    readonly scene_setBackgroundColor: (a: number, b: number, c: number) => void;
    readonly scene_setCameraDistance: (a: number, b: number, c: number) => void;
    readonly scene_setCameraFov: (a: number, b: number, c: number) => void;
    readonly scene_setCameraTarget: (a: number, b: number, c: number) => void;
    readonly scene_setCameraView: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly scene_setDepthCue: (a: number, b: number, c: number) => void;
    readonly scene_setDepthCueColor: (a: number, b: number, c: number) => void;
    readonly scene_setDepthCueRange: (a: number, b: number, c: number, d: number) => void;
    readonly scene_setLightColor: (a: number, b: number, c: number) => void;
    readonly scene_setLightIntensity: (a: number, b: number, c: number) => void;
    readonly scene_setLighting: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly scene_setOutlineEnabled: (a: number, b: number, c: number) => void;
    readonly scene_setOutlineStrength: (a: number, b: number, c: number) => void;
    readonly scene_setScale: (a: number, b: number, c: number) => void;
    readonly scene_setSsaoEnabled: (a: number, b: number, c: number) => void;
    readonly scene_setSsaoStrength: (a: number, b: number, c: number) => void;
    readonly scene_setTransparentBackground: (a: number, b: number, c: number) => void;
    readonly scene_setZoomDisabled: (a: number, b: number, c: number) => void;
    readonly scene_shapeCount: (a: number, b: number) => void;
    readonly scene_toJson: (a: number, b: number) => void;
    readonly scene_useBlackBackground: (a: number, b: number) => void;
    readonly select: (a: number, b: number) => void;
    readonly selection_aromatic: (a: number, b: number) => void;
    readonly selection_cloneSelection: (a: number, b: number) => void;
    readonly selection_difference: (a: number, b: number, c: number) => void;
    readonly selection_element: (a: number, b: number, c: number) => void;
    readonly selection_filterIds: (a: number, b: number, c: number) => void;
    readonly selection_ids: (a: number, b: number) => void;
    readonly selection_len: (a: number, b: number) => void;
    readonly selection_residueIds: (a: number, b: number, c: number) => void;
    readonly selection_sidechain: (a: number, b: number) => void;
    readonly selector_atoms: (a: number, b: number) => void;
    readonly selector_bonds: (a: number, b: number) => void;
    readonly selector_residues: (a: number, b: number) => void;
    readonly sphere_cloneShape: (a: number, b: number) => void;
    readonly sphere_color: (a: number, b: number, c: number) => void;
    readonly sphere_new: (a: number, b: number, c: number) => void;
    readonly sphere_opacity: (a: number, b: number, c: number) => void;
    readonly stick_cloneShape: (a: number, b: number) => void;
    readonly stick_color: (a: number, b: number, c: number) => void;
    readonly stick_new: (a: number, b: number, c: number, d: number) => void;
    readonly stick_opacity: (a: number, b: number, c: number) => void;
    readonly style_ballAndStick: (a: number) => void;
    readonly style_cartoon: (a: number) => void;
    readonly style_cloneStyle: (a: number, b: number) => void;
    readonly style_color: (a: number, b: number, c: number) => void;
    readonly style_configureSurface: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly style_conformer: (a: number, b: number, c: number) => void;
    readonly style_coordinates2d: (a: number, b: number) => void;
    readonly style_metallic: (a: number, b: number, c: number) => void;
    readonly style_opacity: (a: number, b: number, c: number) => void;
    readonly style_outline: (a: number, b: number, c: number, d: number) => void;
    readonly style_rainbowResidues: (a: number, b: number) => void;
    readonly style_roughness: (a: number, b: number, c: number) => void;
    readonly style_scale: (a: number, b: number, c: number) => void;
    readonly style_sphere: (a: number) => void;
    readonly style_stick: (a: number) => void;
    readonly style_surface: (a: number) => void;
    readonly viewer_cameraParameterLogging: (a: number, b: number, c: number) => void;
    readonly viewer_cameraState: (a: number, b: number) => void;
    readonly viewer_close: (a: number, b: number) => void;
    readonly viewer_dispatch: (a: number, b: number, c: number) => void;
    readonly viewer_new: (a: number, b: number) => void;
    readonly viewer_openNotebook: (a: number, b: number) => number;
    readonly viewer_play: (a: number, b: number) => number;
    readonly viewer_playNotebook: (a: number, b: number) => number;
    readonly viewer_render: (a: number, b: number) => number;
    readonly viewer_showCameraParameters: (a: number, b: number, c: number) => void;
    readonly viewer_showFps: (a: number, b: number, c: number) => void;
    readonly viewer_takeScreenshot: (a: number) => number;
    readonly viewer_update: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_8591: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_8593: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_4180: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_4181: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_4181_98: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export5: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
