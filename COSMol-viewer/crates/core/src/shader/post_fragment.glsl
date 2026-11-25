precision highp float;
in vec2 v_uv;
out vec4 out_color;
uniform sampler2D u_color;
uniform sampler2D u_depth;
uniform vec2 u_texel;
uniform mat4 u_inv_projection;
uniform int u_outline_enabled;
uniform int u_ssao_enabled;
uniform float u_outline_strength;
uniform float u_ssao_strength;

vec3 viewPosition(vec2 uv) {
    float z = texture(u_depth, uv).r * 2.0 - 1.0;
    vec4 clip = vec4(uv * 2.0 - 1.0, z, 1.0);
    vec4 view = u_inv_projection * clip;
    return view.xyz / max(view.w, 0.00001);
}

vec3 normalAt(vec2 uv, float depthValue) {
    if (depthValue > 0.9999) return vec3(0.0, 0.0, 1.0);
    vec3 p = viewPosition(uv);
    vec3 px = viewPosition(uv + vec2(u_texel.x, 0.0));
    vec3 py = viewPosition(uv + vec2(0.0, u_texel.y));
    return normalize(cross(px - p, py - p));
}

float depthAt(vec2 uv) {
    return texture(u_depth, uv).r;
}

void main() {
    vec4 color = texture(u_color, v_uv);
    float depth = depthAt(v_uv);

    float edge = 0.0;
    edge = max(edge, abs(depth - depthAt(v_uv + vec2(u_texel.x, 0.0))));
    edge = max(edge, abs(depth - depthAt(v_uv - vec2(u_texel.x, 0.0))));
    edge = max(edge, abs(depth - depthAt(v_uv + vec2(0.0, u_texel.y))));
    edge = max(edge, abs(depth - depthAt(v_uv - vec2(0.0, u_texel.y))));
    vec3 normal = normalAt(v_uv, depth);
    float normalEdge = 0.0;
    normalEdge = max(normalEdge, 1.0 - dot(normal, normalAt(v_uv + vec2(u_texel.x, 0.0), depthAt(v_uv + vec2(u_texel.x, 0.0)))));
    normalEdge = max(normalEdge, 1.0 - dot(normal, normalAt(v_uv - vec2(u_texel.x, 0.0), depthAt(v_uv - vec2(u_texel.x, 0.0)))));
    normalEdge = max(normalEdge, 1.0 - dot(normal, normalAt(v_uv + vec2(0.0, u_texel.y), depthAt(v_uv + vec2(0.0, u_texel.y)))));
    normalEdge = max(normalEdge, 1.0 - dot(normal, normalAt(v_uv - vec2(0.0, u_texel.y), depthAt(v_uv - vec2(0.0, u_texel.y)))));
    if (u_outline_enabled != 0) {
        float outline = smoothstep(0.00002, 0.0005, edge);
        color.rgb = mix(color.rgb, vec3(0.03, 0.035, 0.045), outline * u_outline_strength);
        color.a = max(color.a, outline * u_outline_strength * 1.4);
    }

    float occlusion = 0.0;
    if (u_ssao_enabled == 0) {
        out_color = color;
        return;
    }
    vec3 position = viewPosition(v_uv);
    vec2 r = u_texel * 4.0;
    vec2 offsets[8] = vec2[8](
        vec2(r.x, 0.0), vec2(r.x * 0.7, r.y * 0.7), vec2(0.0, r.y), vec2(-r.x * 0.7, r.y * 0.7),
        vec2(-r.x, 0.0), vec2(-r.x * 0.7, -r.y * 0.7), vec2(0.0, -r.y), vec2(r.x * 0.7, -r.y * 0.7)
    );
    if (depth < 0.9999) {
        for (int i = 0; i < 8; i++) {
            vec2 uv2 = v_uv + offsets[i];
            float d2 = depthAt(uv2);
            if (d2 > 0.9999) continue;
            vec3 samplePosition = viewPosition(uv2);
            vec3 delta = samplePosition - position;
            float distanceToSample = length(delta);
            if (distanceToSample > 0.001 && distanceToSample < 0.85 && dot(normalize(delta), normal) > 0.2) {
                if (samplePosition.z < position.z - 0.02) {
                    occlusion += 1.0 - distanceToSample / 0.85;
                }
            }
        }
        occlusion /= 8.0;
    }
    color.rgb *= 1.0 - occlusion * u_ssao_strength;

    out_color = color;
}
