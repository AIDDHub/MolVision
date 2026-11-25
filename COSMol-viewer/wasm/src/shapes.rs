//! Positioned shapes retain their own material; Scene snapshots them on insertion.
use cosmol_viewer_core::{
    display::SceneItem,
    shapes::{Mesh as CoreMesh, Sphere as CoreSphere, Stick as CoreStick},
    utils::{MeshData, Vec3Pub as Vec3, Vec4Pub as Vec4},
};
use wasm_bindgen::prelude::*;
#[derive(Clone)]
#[wasm_bindgen]
pub struct Sphere {
    pub(crate) inner: CoreSphere,
}
#[derive(Clone)]
#[wasm_bindgen]
pub struct Stick {
    pub(crate) inner: CoreStick,
}
impl crate::input::NativeOutput for Sphere {}
impl crate::input::NativeOutput for Stick {}
#[derive(Clone)]
#[wasm_bindgen]
pub struct Mesh {
    pub(crate) inner: CoreMesh,
}
impl crate::input::NativeOutput for Mesh {}
#[cosmol_viewer_derive::checked_wasm]
impl Sphere {
    pub fn new(center: Vec<f32>, radius: f32) -> Result<Self, String> {
        let inner = CoreSphere::new(crate::scene::vector3(center)?, radius);
        inner.to_shape(None).map_err(|e| e.to_string())?;
        Ok(Self { inner })
    }
    pub fn clone_shape(&self) -> Self {
        self.clone()
    }
    pub fn color(&self, rgb: Vec<u8>) -> Result<Self, String> {
        Ok(Self {
            inner: self.inner.color(crate::scene::rgb(rgb)?),
        })
    }
    pub fn opacity(&self, opacity: f32) -> Result<Self, String> {
        if !opacity.is_finite() || !(0.0..=1.0).contains(&opacity) {
            return Err("Opacity must be in [0, 1]".into());
        }
        Ok(Self {
            inner: self.inner.opacity(opacity),
        })
    }
}
#[cosmol_viewer_derive::checked_wasm]
impl Stick {
    pub fn new(start: Vec<f32>, end: Vec<f32>, radius: f32) -> Result<Self, String> {
        let inner = CoreStick::new(
            crate::scene::vector3(start)?,
            crate::scene::vector3(end)?,
            radius,
        );
        inner.to_shape(None).map_err(|e| e.to_string())?;
        Ok(Self { inner })
    }
    pub fn clone_shape(&self) -> Self {
        self.clone()
    }
    pub fn color(&self, rgb: Vec<u8>) -> Result<Self, String> {
        Ok(Self {
            inner: self.inner.color(crate::scene::rgb(rgb)?),
        })
    }
    pub fn opacity(&self, opacity: f32) -> Result<Self, String> {
        if !opacity.is_finite() || !(0.0..=1.0).contains(&opacity) {
            return Err("Opacity must be in [0, 1]".into());
        }
        Ok(Self {
            inner: self.inner.opacity(opacity),
        })
    }
}

#[cosmol_viewer_derive::checked_wasm]
impl Mesh {
    pub fn new(
        vertices: Vec<f32>,
        indices: Vec<u32>,
        normals: Vec<f32>,
        colors: Vec<u8>,
    ) -> Result<Self, String> {
        if vertices.len() % 3 != 0 {
            return Err("Vertices must be a flat xyz array".into());
        }
        if !normals.is_empty() && normals.len() != vertices.len() {
            return Err("Normals must match vertices".into());
        }
        let positions: Vec<Vec3> = vertices
            .chunks_exact(3)
            .map(|v| Vec3::new(v[0], v[1], v[2]))
            .collect();
        if positions.iter().any(|v| !v.is_finite()) {
            return Err("Vertices must be finite".into());
        }
        let normals: Vec<Vec3> = normals
            .chunks_exact(3)
            .map(|v| Vec3::new(v[0], v[1], v[2]))
            .collect();
        let colors = if colors.is_empty() {
            None
        } else {
            if colors.len() != positions.len() * 4 {
                return Err("Colors must be RGBA per vertex".into());
            }
            Some(
                colors
                    .chunks_exact(4)
                    .map(|c| Vec4::new(c[0] as f32 / 255.0, c[1] as f32 / 255.0, c[2] as f32 / 255.0, c[3] as f32 / 255.0))
                    .collect(),
            )
        };
        if indices.iter().any(|index| *index as usize >= positions.len()) {
            return Err("Index out of range".into());
        }
        let inner = CoreMesh::new(MeshData {
            vertices: positions,
            normals,
            indices,
            colors,
            material_params: None,
            transform: None,
            is_wireframe: false,
            double_sided: true,
        });
        inner.to_shape(None).map_err(|e| e.to_string())?;
        Ok(Self { inner })
    }

    pub fn clone_shape(&self) -> Self {
        self.clone()
    }
}
