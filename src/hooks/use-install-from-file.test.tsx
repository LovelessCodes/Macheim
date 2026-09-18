import { beforeEach, expect, mock, test, type Mock } from "bun:test";

import { renderHook } from "@testing-library/react";

import type { DownloadItem } from "../lib/types";

function queuedItem(path: string): DownloadItem {
  return {
    id: 1,
    full_name: "Local-CoolMod",
    name: "CoolMod",
    version: "1.0.0",
    kind: "mod",
    status: "queued",
    message: "Queued",
    current: 0,
    total: 0,
    bytes_downloaded: 0,
    bytes_total: null,
    error: null,
    retry_count: 0,
    installed_count: 0,
    local_path: path,
    queued_at: "2026-01-01T00:00:00Z",
    finished_at: null,
  };
}

void mock.module("@tauri-apps/plugin-dialog", () => ({
  open: mock(() => Promise.resolve(["/tmp/CoolMod.zip"])),
}));
void mock.module("../lib/tauri", () => ({
  enqueueLocalInstall: mock((path: string) => Promise.resolve(queuedItem(path))),
}));

import { enqueueLocalInstall } from "../lib/tauri";
import { useInstallFromFile } from "./use-install-from-file";

const enqueueMock = enqueueLocalInstall as Mock<typeof enqueueLocalInstall>;

beforeEach(() => {
  enqueueMock.mockClear();
  enqueueMock.mockImplementation((path: string) => Promise.resolve(queuedItem(path)));
});

test("queues every dropped zip and ignores other files", async () => {
  const { result } = renderHook(() => useInstallFromFile());

  const queued = await result.current.installPaths([
    "/tmp/CoolMod.zip",
    "/tmp/notes.txt",
    "/tmp/Other.ZIP",
  ]);

  expect(queued).toBe(2);
  expect(enqueueMock).toHaveBeenCalledTimes(2);
  expect(enqueueMock).toHaveBeenCalledWith("/tmp/CoolMod.zip");
  expect(enqueueMock).toHaveBeenCalledWith("/tmp/Other.ZIP");
});

test("keeps going when one archive fails", async () => {
  enqueueMock.mockImplementationOnce(() => Promise.reject("not a zip archive"));
  const { result } = renderHook(() => useInstallFromFile());

  const queued = await result.current.installPaths(["/tmp/Broken.zip", "/tmp/Good.zip"]);

  expect(queued).toBe(1);
  expect(enqueueMock).toHaveBeenCalledTimes(2);
});

test("does nothing when no zip is provided", async () => {
  const { result } = renderHook(() => useInstallFromFile());

  const queued = await result.current.installPaths(["/tmp/readme.md"]);

  expect(queued).toBe(0);
  expect(enqueueMock).not.toHaveBeenCalled();
});
