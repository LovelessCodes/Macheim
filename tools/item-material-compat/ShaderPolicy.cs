using System;

namespace Macheim.ItemMaterialCompat
{
    internal static class ShaderPolicy
    {
        internal static bool MatchesExact(string prefab, string names)
        {
            prefab = prefab.Replace("(Clone)", "").Trim();
            foreach (var value in names.Split(','))
                if (value.Trim().Length > 0 && prefab == value.Trim()) return true;
            return false;
        }

        internal static bool Matches(string prefab, string prefixes, string suffixes)
        {
            prefab = prefab.Replace("(Clone)", "").Trim();
            foreach (var value in prefixes.Split(','))
            {
                var token = value.Trim();
                if (token.Length > 0 && prefab.StartsWith(token, StringComparison.Ordinal)) return true;
            }
            foreach (var value in suffixes.Split(','))
            {
                var token = value.Trim();
                if (token.Length > 0 && prefab.EndsWith(token, StringComparison.Ordinal)) return true;
            }
            return false;
        }

        internal static bool UsesOpaqueMeshFallback(string shader, bool mesh)
        {
            // Mesh mode also renders translucent auras. An unlit mesh is still an
            // effect, not an opaque item body. Surface/Piece/Creature are the body path.
            return mesh && (shader == "Particles/Standard Surface" || shader == "Custom/Piece" || shader == "Custom/Creature");
        }

        internal static bool NeedsParticleRepair(string shader, bool supported, bool mesh)
        {
            if (!supported || string.IsNullOrEmpty(shader) || shader == "Hidden/InternalErrorShader") return true;
            // The "2" shaders are native Valheim variants, not the bundled Unity variants.
            if (shader == "Particles/Standard Unlit2" || shader == "Particles/Standard Surface2" ||
                shader == "Custom/Particle (Unlit)" || shader == "Custom/LitParticles" || shader == "Sprites/Default") return false;
            if (mesh && shader == "Custom/Creature") return false;
            return shader == "Particles/Standard Unlit" || shader == "Particles/Standard Surface" ||
                   shader.StartsWith("Legacy Shaders/Particles/", StringComparison.Ordinal) ||
                   shader == "Custom/Piece" || (!mesh && shader == "Custom/Creature");
        }
    }
}
