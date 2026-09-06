using System;
using System.Collections.Generic;
using BepInEx;
using BepInEx.Configuration;
using HarmonyLib;
using UnityEngine;
using UnityEngine.Rendering;

namespace Macheim.ItemMaterialCompat
{
    [BepInPlugin(Id, "Macheim Item Material Compatibility", "0.2.0")]
    public sealed class ItemMaterialCompat : BaseUnityPlugin
    {
        public const string Id = "com.macheim.itemmaterialcompat";
        internal static ItemMaterialCompat Instance;
        internal ConfigEntry<bool> Enabled;
        private ConfigEntry<string> prefixes, suffixes, exactPrefabs, particleShader;
        private bool compatibleRuntime;
        private long cachedTextureBytes;
        private readonly Dictionary<string, Shader> shaders = new Dictionary<string, Shader>();
        private readonly HashSet<string> logged = new HashSet<string>();
        private readonly Dictionary<Texture, Texture2D> additiveTextures = new Dictionary<Texture, Texture2D>();
        private readonly HashSet<Texture> failedTextures = new HashSet<Texture>();
        private Harmony harmony;

        private void Awake()
        {
            Instance = this;
            Enabled = Config.Bind("General", "Enabled", false, "Managed by Macheim. Restart after changing to restore original runtime materials.");
            exactPrefabs = Config.Bind("Scope", "Item Prefabs", "", "Exact tested ItemDrop names supplied by Macheim's versioned compatibility catalog.");
            prefixes = Config.Bind("Scope", "Item Prefab Prefixes", "", "Advanced unverified scope. Macheim leaves this empty. Empty tokens never match.");
            suffixes = Config.Bind("Scope", "Item Prefab Suffixes", "", "Advanced unverified scope. Macheim leaves this empty.");
            particleShader = Config.Bind("Rendering", "Particle Shader", "Sprites/Default", "Conservative visible particle fallback. Preserves texture and vertex color, but not original additive brightness. Restart after changing.");
            if (Application.platform != RuntimePlatform.OSXPlayer || SystemInfo.graphicsDeviceType != GraphicsDeviceType.Metal)
            {
                Logger.LogInfo("Inactive: this patch only runs on macOS Metal.");
                return;
            }
            // Version is internal in assembly_valheim. Fail closed if its API changes.
            var versionType = typeof(ItemDrop).Assembly.GetType("Version");
            var gameVersion = versionType == null ? null : AccessTools.Property(versionType, "CurrentVersion")?.GetValue(null)?.ToString();
            compatibleRuntime = gameVersion == "0.221.12" && Application.unityVersion == "6000.0.61f1";
            if (!compatibleRuntime)
            {
                Logger.LogWarning($"[CompatibilityStatus] inactive: unverified game/Unity version {gameVersion}/{Application.unityVersion}. No materials changed.");
                return;
            }
            harmony = new Harmony(Id);
            harmony.PatchAll(typeof(ItemMaterialCompat).Assembly);
            Logger.LogInfo("Active: renderer-scoped cloned materials; no global material-name overrides, input automation or file-triggered commands.");
        }

        private void OnDestroy()
        {
            harmony?.UnpatchSelf();
            foreach (var texture in additiveTextures.Values) if (texture) Destroy(texture);
            if (Instance == this) Instance = null;
        }

        private bool Matches(string name) => compatibleRuntime && Enabled.Value &&
            (ShaderPolicy.MatchesExact(name, exactPrefabs.Value) || ShaderPolicy.Matches(name, prefixes.Value, suffixes.Value));

        [HarmonyPatch(typeof(ItemDrop), "Awake")]
        private static class ItemAwake
        {
            [HarmonyPostfix]
            private static void Postfix(ItemDrop __instance)
            {
                if (!Instance || !Instance.Matches(__instance.name)) return;
                if (!__instance.GetComponent<ItemMaterialGuard>()) __instance.gameObject.AddComponent<ItemMaterialGuard>();
            }
        }

        private Shader Resolve(string name)
        {
            if (shaders.TryGetValue(name, out var cached) && cached && cached.isSupported) return cached;
            // Do not cache failures: game shaders arrive after the mod bundles.
            foreach (var shader in Resources.FindObjectsOfTypeAll<Shader>())
                if (shader.name == name && shader.isSupported) return shaders[name] = shader;
            var found = Shader.Find(name);
            if (found && found.isSupported) return shaders[name] = found;
            return null;
        }

        internal Material Repair(Material source, bool mesh, string prefab)
        {
            if (!source) return source;
            // Another shader helper may revisit our clone. Its guard restores it;
            // never clone that clone repeatedly and leak a material every three seconds.
            if (source.name.StartsWith("MacheimCompat/", StringComparison.Ordinal)) return source;
            var original = source.shader;
            var originalName = original ? original.name : "";
            mesh = ShaderPolicy.UsesOpaqueMeshFallback(originalName, mesh);
            var clippedMesh = mesh && originalName == "Custom/Creature" && source.HasProperty("_Color") && source.GetColor("_Color").a <= 0.001f;
            if (!clippedMesh && !ShaderPolicy.NeedsParticleRepair(originalName, original && original.isSupported, mesh)) return source;
            var target = mesh ? Resolve("Custom/Creature") : Resolve(particleShader.Value) ?? Resolve("Sprites/Default");
            if (!target) return source;

            var tint = source.HasProperty("_TintColor") ? source.GetColor("_TintColor") :
                       source.HasProperty("_Color") ? source.GetColor("_Color") : Color.white;
            // Opaque mesh-particle surface shaders can ignore a zero alpha that the replacement clips.
            if (mesh && tint.a <= 0.001f) tint.a = 1f;
            var tex = source.HasProperty("_MainTex") ? source.GetTexture("_MainTex") : null;
            var additive = originalName.IndexOf("Additive", StringComparison.OrdinalIgnoreCase) >= 0 ||
                           (source.HasProperty("_DstBlend") && Math.Abs(source.GetFloat("_DstBlend") - 1f) < 0.01f);
            if (!mesh && additive && target.name == "Sprites/Default" && tex) tex = ConvertAdditiveTexture(tex);
            var materialName = source.name.Replace("MacheimCompat/", "");
            var clone = new Material(source) { name = "MacheimCompat/" + materialName, shader = target };
            // Material copy retains textures, UV transforms and other saved properties.
            clone.shaderKeywords = Array.Empty<string>();
            if (mesh && source.HasProperty("_EmissionColor") && source.GetColor("_EmissionColor").maxColorComponent > 0.001f)
                clone.EnableKeyword("_EMISSION");
            if (clone.HasProperty("_MainTex")) clone.SetTexture("_MainTex", tex);
            if (clone.HasProperty("_Color")) clone.SetColor("_Color", tint);
            if (clone.HasProperty("_TintColor")) clone.SetColor("_TintColor", tint);
            if (!mesh)
            {
                clone.renderQueue = 3000;
                if (clone.HasProperty("_ZWrite")) clone.SetFloat("_ZWrite", 0);
                if (clone.HasProperty("_SrcBlend")) clone.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                if (clone.HasProperty("_DstBlend")) clone.SetFloat("_DstBlend", (float)(additive ? BlendMode.One : BlendMode.OneMinusSrcAlpha));
            }
            var key = prefab.Replace("(Clone)", "") + "|" + source.name + "|" + target.name;
            if (logged.Add(key)) Logger.LogInfo($"[ItemRepair] prefab='{prefab}' mode={(mesh ? "Mesh" : "Particle")} additive={additive} material='{source.name}' '{originalName}' -> '{target.name}' texture='{(tex ? tex.name : "<null>")}' tint={tint}");
            return clone;
        }

        private Texture ConvertAdditiveTexture(Texture source)
        {
            if (additiveTextures.TryGetValue(source, out var cached) && cached) return cached;
            if (failedTextures.Contains(source)) return source;
            // Bound the one-time readback allocation; never resize or modify source assets.
            var estimatedBytes = (long)source.width * source.height * 6; // RGBA + mip budget
            if (!(source is Texture2D) || source.width > 2048 || source.height > 2048 ||
                cachedTextureBytes + estimatedBytes > 64L * 1024 * 1024) return source;
            var previous = RenderTexture.active;
            RenderTexture temporary = null;
            Texture2D copy = null;
            try
            {
                temporary = RenderTexture.GetTemporary(source.width, source.height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear);
                Graphics.Blit(source, temporary);
                RenderTexture.active = temporary;
                copy = new Texture2D(source.width, source.height, TextureFormat.RGBA32, true, true)
                {
                    name = "MacheimAdditiveAlpha/" + source.name,
                    filterMode = source.filterMode,
                    wrapMode = source.wrapMode,
                    anisoLevel = source.anisoLevel
                };
                copy.ReadPixels(new Rect(0, 0, source.width, source.height), 0, 0);
                var pixels = copy.GetPixels32();
                for (var i = 0; i < pixels.Length; i++)
                {
                    var pixel = pixels[i];
                    var converted = AdditiveAlpha.Convert(pixel.r, pixel.g, pixel.b, pixel.a);
                    pixels[i] = new Color32(converted.r, converted.g, converted.b, converted.a);
                }
                copy.SetPixels32(pixels);
                copy.Apply(true, true);
                additiveTextures[source] = copy;
                cachedTextureBytes += estimatedBytes;
                Logger.LogInfo($"[AdditiveAlpha] cached '{source.name}' {source.width}x{source.height}; original texture unchanged");
                return copy;
            }
            catch (Exception error)
            {
                if (copy) Destroy(copy);
                failedTextures.Add(source);
                Logger.LogWarning($"Additive texture bridge failed for '{source.name}': {error.Message}");
                return source;
            }
            finally
            {
                RenderTexture.active = previous;
                if (temporary) RenderTexture.ReleaseTemporary(temporary);
            }
        }
    }

    // Checks only this mod item's cached particle renderers. No scene-wide per-frame sweeps.
    public sealed class ItemMaterialGuard : MonoBehaviour
    {
        private ParticleSystemRenderer[] renderers;
        private readonly List<MaterialState> owned = new List<MaterialState>();
        private float nextCheck;

        private void Start() { renderers = GetComponentsInChildren<ParticleSystemRenderer>(true); }

        private void LateUpdate()
        {
            if (Time.unscaledTime < nextCheck) return;
            nextCheck = Time.unscaledTime + 3f;
            var plugin = ItemMaterialCompat.Instance;
            if (!plugin || !plugin.Enabled.Value || renderers == null) return;
            foreach (var renderer in renderers)
            {
                if (!renderer) continue;
                var materials = renderer.sharedMaterials;
                var changed = false;
                for (var i = 0; i < materials.Length; i++)
                {
                    // Slot 1 is the trail even for a mesh-particle system.
                    var mesh = i == 0 && renderer.renderMode == ParticleSystemRenderMode.Mesh;
                    var replacement = plugin.Repair(materials[i], mesh, name);
                    if (replacement == materials[i]) continue;
                    owned.Add(new MaterialState(replacement));
                    materials[i] = replacement;
                    changed = true;
                }
                if (changed) renderer.sharedMaterials = materials;
                var trail = renderer.trailMaterial;
                var fixedTrail = plugin.Repair(trail, false, name);
                if (fixedTrail != trail) { owned.Add(new MaterialState(fixedTrail)); renderer.trailMaterial = fixedTrail; }
            }
            // ShaderHelper can revisit new clones after our item hook. Reassert only our
            // own material's bridge state, never the source or other renderers' materials.
            foreach (var state in owned) state.Restore();
        }

        private void OnDestroy()
        {
            foreach (var state in owned) if (state.Material) Destroy(state.Material);
            owned.Clear();
        }

        private sealed class MaterialState
        {
            internal readonly Material Material;
            private readonly Shader shader;
            private readonly Texture texture;
            private readonly Color color, emission;
            private readonly bool hasColor, hasEmission, emissionKeyword;
            internal MaterialState(Material material)
            {
                Material = material;
                shader = material.shader;
                texture = material.HasProperty("_MainTex") ? material.GetTexture("_MainTex") : null;
                hasColor = material.HasProperty("_Color");
                color = hasColor ? material.GetColor("_Color") : Color.white;
                hasEmission = material.HasProperty("_EmissionColor");
                emission = hasEmission ? material.GetColor("_EmissionColor") : Color.black;
                emissionKeyword = material.IsKeywordEnabled("_EMISSION");
            }
            internal void Restore()
            {
                if (!Material) return;
                if (Material.shader != shader) Material.shader = shader;
                if (Material.HasProperty("_MainTex") && Material.GetTexture("_MainTex") != texture) Material.SetTexture("_MainTex", texture);
                if (hasColor && Material.GetColor("_Color") != color) Material.SetColor("_Color", color);
                if (hasEmission && Material.GetColor("_EmissionColor") != emission) Material.SetColor("_EmissionColor", emission);
                if (emissionKeyword && !Material.IsKeywordEnabled("_EMISSION")) Material.EnableKeyword("_EMISSION");
            }
        }
    }
}
