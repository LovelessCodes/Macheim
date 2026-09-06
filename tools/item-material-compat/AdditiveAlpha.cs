using System;

namespace Macheim.ItemMaterialCompat
{
    internal static class AdditiveAlpha
    {
        // Approximate additive RGB using an alpha-blended fallback. Black contributes
        // no light in additive blending, so it must not become an opaque black pixel.
        internal static (byte r, byte g, byte b, byte a) Convert(byte r, byte g, byte b, byte a)
        {
            var peak = Math.Max(r, Math.Max(g, b));
            if (peak == 0 || a == 0) return (0, 0, 0, 0);
            return ((byte)((r * 255 + peak / 2) / peak),
                    (byte)((g * 255 + peak / 2) / peak),
                    (byte)((b * 255 + peak / 2) / peak),
                    (byte)((a * peak + 127) / 255));
        }
    }
}
