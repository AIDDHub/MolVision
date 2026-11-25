use crate::utils::MeshData;

/// Arbitrary triangle mesh supplied by a host language (ribbons, planes, ...).
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
pub struct Mesh {
    pub data: MeshData,
}

impl Mesh {
    pub fn new(data: MeshData) -> Self {
        Self { data }
    }

    pub fn scaled(&self, scale: f32) -> MeshData {
        let mut mesh = self.data.clone();
        for vertex in &mut mesh.vertices {
            *vertex *= scale;
        }
        mesh
    }
}
