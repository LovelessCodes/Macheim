#!/bin/sh
set -eu
# Run from the repository root, with Valheim and BepInEx installed locally.
# GameRoot can be overridden without redistributing any game/reference DLLs.
if [ -n "${MACHEIM_GAME_ROOT:-}" ]; then
  dotnet build tools/item-material-compat/ItemMaterialCompat.csproj -c Release "-p:GameRoot=$MACHEIM_GAME_ROOT"
else
  dotnet build tools/item-material-compat/ItemMaterialCompat.csproj -c Release
fi
dotnet run --project tools/item-material-compat/tests/PolicyTests.csproj -c Release
mkdir -p src-tauri/resources/compatibility
cp tools/item-material-compat/bin/Release/netstandard2.1/Macheim.ItemMaterialCompat.dll src-tauri/resources/compatibility/Macheim.ItemMaterialCompat.dll
node scripts/verify-release.mjs --record-plugin-build
