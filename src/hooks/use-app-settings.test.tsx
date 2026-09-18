import { beforeEach, expect, mock, test, type Mock } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

void mock.module("../lib/tauri", () => ({
  getAppSettings: mock(() => Promise.resolve({ console_enabled: true, snapshot_saves: true })),
  setConsoleEnabled: mock((enabled: boolean) =>
    Promise.resolve({ console_enabled: enabled, snapshot_saves: true }),
  ),
  setSnapshotSaves: mock((enabled: boolean) =>
    Promise.resolve({ console_enabled: true, snapshot_saves: enabled }),
  ),
}));

import { appSettingsQueryKey } from "../lib/query-keys";
import { getAppSettings, setConsoleEnabled } from "../lib/tauri";
import type { AppSettings } from "../lib/types";
import { useAppSettings, useSetConsoleEnabled } from "./use-app-settings";

const getMock = getAppSettings as Mock<typeof getAppSettings>;
const setMock = setConsoleEnabled as Mock<typeof setConsoleEnabled>;

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mock.clearAllMocks();
  getMock.mockImplementation(() =>
    Promise.resolve({ console_enabled: true, snapshot_saves: true }),
  );
  setMock.mockImplementation((enabled: boolean) =>
    Promise.resolve({ console_enabled: enabled, snapshot_saves: true }),
  );
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

test("loads the console preference", async () => {
  const { result } = renderHook(() => useAppSettings(), { wrapper });

  await waitFor(() => expect(result.current.data?.console_enabled).toBe(true));
});

test("toggling the console updates the cached settings", async () => {
  const { result } = renderHook(
    () => ({ settings: useAppSettings(), setConsole: useSetConsoleEnabled() }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.settings.data).toBeTruthy());

  result.current.setConsole.mutate(false);

  await waitFor(() =>
    expect(queryClient.getQueryData<AppSettings>(appSettingsQueryKey)?.console_enabled).toBe(false),
  );
  // React Query passes its mutation context as a second argument.
  expect(setMock.mock.calls[0]?.[0]).toBe(false);
});

test("a failed toggle rolls the switch back", async () => {
  setMock.mockImplementationOnce(() => Promise.reject("disk full"));
  const { result } = renderHook(
    () => ({ settings: useAppSettings(), setConsole: useSetConsoleEnabled() }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.settings.data).toBeTruthy());

  result.current.setConsole.mutate(false);

  await waitFor(() => expect(result.current.setConsole.isError).toBe(true));
  expect(queryClient.getQueryData<AppSettings>(appSettingsQueryKey)?.console_enabled).toBe(true);
});
