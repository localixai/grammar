import { describe, expect, test, vi } from "vitest";

import { CredentialCoordinator } from "./credential-coordinator";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("CredentialCoordinator", () => {
  test("shares one interactive authorization flow between concurrent callers", async () => {
    const authorization = deferred<string>();
    const authorize = vi.fn(() => authorization.promise);
    const store = vi.fn(() => Promise.resolve());
    const clear = vi.fn(() => Promise.resolve());
    const credentials = new CredentialCoordinator(authorize, store, clear);

    const first = credentials.connect();
    const second = credentials.connect();
    authorization.resolve("sk-test");

    await Promise.all([first, second]);
    expect(authorize).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledWith("sk-test");
  });

  test("never stores a late OAuth result after disconnect", async () => {
    const authorization = deferred<string>();
    const store = vi.fn(() => Promise.resolve());
    const clear = vi.fn(() => Promise.resolve());
    const credentials = new CredentialCoordinator(() => authorization.promise, store, clear);

    const connection = credentials.connect();
    await credentials.disconnect();
    authorization.resolve("sk-late");

    await expect(connection).rejects.toThrow("cancelled");
    expect(store).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledOnce();
  });

  test("clears a key when disconnect races with storage.set", async () => {
    const storageWrite = deferred<void>();
    const store = vi.fn(() => storageWrite.promise);
    const clear = vi.fn(() => Promise.resolve());
    const credentials = new CredentialCoordinator(() => Promise.resolve("sk-test"), store, clear);

    const connection = credentials.connect();
    await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());
    await credentials.disconnect();
    storageWrite.resolve();

    await expect(connection).rejects.toThrow("cancelled");
    expect(clear).toHaveBeenCalledTimes(2);
  });

  test("allows a fresh authorization after the previous one settles", async () => {
    const authorize = vi
      .fn<Authorize>()
      .mockResolvedValueOnce("sk-first")
      .mockResolvedValueOnce("sk-second");
    const store = vi.fn(() => Promise.resolve());
    const credentials = new CredentialCoordinator(authorize, store, () => Promise.resolve());

    await credentials.connect();
    await credentials.connect();

    expect(authorize).toHaveBeenCalledTimes(2);
    expect(store).toHaveBeenNthCalledWith(1, "sk-first");
    expect(store).toHaveBeenNthCalledWith(2, "sk-second");
  });

  test("validates and stores a directly supplied credential", async () => {
    const store = vi.fn(() => Promise.resolve());
    const validate = vi.fn(() => Promise.resolve("sk-normalized"));
    const credentials = new CredentialCoordinator(
      () => Promise.resolve("sk-oauth"),
      store,
      () => Promise.resolve(),
    );

    await credentials.connectCredential(" sk-manual ", validate);

    expect(validate).toHaveBeenCalledWith(" sk-manual ");
    expect(store).toHaveBeenCalledWith("sk-normalized");
  });

  test("disconnect takes precedence over direct credential validation", async () => {
    const validation = deferred<string>();
    const store = vi.fn(() => Promise.resolve());
    const clear = vi.fn(() => Promise.resolve());
    const credentials = new CredentialCoordinator(() => Promise.resolve("sk-oauth"), store, clear);

    const connection = credentials.connectCredential("sk-manual", () => validation.promise);
    await credentials.disconnect();
    validation.resolve("sk-manual");

    await expect(connection).rejects.toThrow("cancelled");
    expect(store).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledOnce();
  });
});

type Authorize = () => Promise<string>;
