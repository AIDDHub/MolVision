# COSMol Viewer 补丁

## 0001-camera-state.patch

给 COSMol Viewer 增加：

- `CameraSnapshot` / `latest_camera_snapshot()`：实时 orbit 相机快照
- `Canvas::custom_painting` 每帧写入快照，并带 `frame` 计数（截图屏障用）
- WASM `Viewer.cameraState() -> Float32Array`
  `[azimuth, elevation, roll, distance, target.x/y/z, fov, frame]`

应用方式（参考库目录内）：

```bash
patch -p1 < ../patches/0001-camera-state.patch
../scripts/build-cosmol-wasm.sh
```

`build-cosmol-wasm.sh` 需要：

- Rust + `wasm32-unknown-unknown` target
- `wasm-bindgen` CLI 0.2.129（与 crate 版本匹配）
- 依赖已可下载（或本地 Cargo registry）

脚本会把生成的 wasm/js/d.ts 复制到 `webapp/node_modules/@cosmol-studio/cosmol-viewer/`。
重新 `npm install` 后如果覆盖了该包，重跑脚本即可。

## 0002-mesh.patch

给 COSMol 增加公开的三角网格图元：

- core `shapes::Mesh` / `Shape::Mesh` / `MeshData`
- wasm `Mesh.new(vertices, indices, normals, colors)`
- `Scene.add/set` 接受 `Mesh`
- `__setViewerTypes` 增加 Mesh 构造器

应用顺序：

```bash
patch -p1 < ../patches/0001-camera-state.patch
patch -p1 < ../patches/0002-mesh.patch
../scripts/build-cosmol-wasm.sh
```

示例样式：`nucleic-ribbon`、`nucleic-ribbon-base`。

## 0003-postprocess.patch

新增屏幕空间后处理：

- 离屏颜色 + 深度纹理 FBO
- 深度边缘描边
- 基于深度的简易 SSAO
- 保留 offscreen 渲染路径（后处理只对默认帧缓冲启用）

应用顺序：0001 → 0002 → 0003。
