import { beforeEach, expect, mock, test, type Mock } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const baseSettings: AppSettings = {
  console_enabled: true,
  snapshot_saves: true,
  cdn_preference: "auto",
};

void mock.module("../lib/tauri", () => ({
  getAppSettings: mock(() => Promise.resolve(baseSettings)),
  setConsoleEnabled: mock((enabled: boolean) =>
    Promise.resolve({ ...baseSettings, console_enabled: enabled }),
  ),
  setSnapshotSaves: mock((enabled: boolean) =>
    Promise.resolve({ ...baseSettings, snapshot_saves: enabled }),
  ),
  setCdnPreference: mock((preference: CdnPreference) =>
    Promise.resolve({ ...baseSettings, cdn_preference: preference }),
  ),
}));

import { appSettingsQueryKey } from "../lib/query-keys";
import { getAppSettings, setCdnPreference, setConsoleEnabled } from "../lib/tauri";
import type { AppSettings, CdnPreference } from "../lib/types";
import { useAppSettings, useSetCdnPreference, useSetConsoleEnabled } from "./use-app-settings";

const getMock = getAppSettings as Mock<typeof getAppSettings>;
const setMock = setConsoleEnabled as Mock<typeof setConsoleEnabled>;
const setCdnMock = setCdnPreference as Mock<typeof setCdnPreference>;

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mock.clearAllMocks();
  getMock.mockImplementation(() => Promise.resolve(baseSettings));
  setMock.mockImplementation((enabled: boolean) =>
    Promise.resolve({ ...baseSettings, console_enabled: enabled }),
  );
  setCdnMock.mockImplementation((preference: CdnPreference) =>
    Promise.resolve({ ...baseSettings, cdn_preference: preference }),
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

test("changing the CDN preference updates the cached settings", async () => {
  const { result } = renderHook(
    () => ({ settings: useAppSettings(), setCdn: useSetCdnPreference() }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.settings.data).toBeTruthy());

  result.current.setCdn.mutate("alternative");

  await waitFor(() =>
    expect(queryClient.getQueryData<AppSettings>(appSettingsQueryKey)?.cdn_preference).toBe(
      "alternative",
    ),
  );
  expect(setCdnMock.mock.calls[0]?.[0]).toBe("alternative");
});
