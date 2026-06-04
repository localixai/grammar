type Authorize = () => Promise<string>;
type StoreCredential = (credential: string) => Promise<void>;
type ClearCredential = () => Promise<void>;
type ValidateCredential = (credential: string) => Promise<string>;

/**
 * Owns the credential mutation lifecycle.
 *
 * Only one interactive authorization flow may run at a time. Incrementing the
 * generation before clearing ensures a late OAuth response cannot reconnect a
 * user who already chose Disconnect.
 */
export class CredentialCoordinator {
  private generation = 0;
  private pendingConnection: Promise<void> | null = null;

  constructor(
    private readonly authorize: Authorize,
    private readonly storeCredential: StoreCredential,
    private readonly clearCredential: ClearCredential,
  ) {}

  connect(): Promise<void> {
    if (this.pendingConnection) return this.pendingConnection;

    const generation = this.generation;
    const operation = this.authorize().then(async (credential) => {
      if (generation !== this.generation) {
        throw new Error("OpenRouter connection was cancelled.");
      }

      await this.storeCredential(credential);
      if (generation !== this.generation) {
        // Disconnect may have completed while storage.set was still pending.
        await this.clearCredential();
        throw new Error("OpenRouter connection was cancelled.");
      }
    });

    const tracked = operation.finally(() => {
      if (this.pendingConnection === tracked) this.pendingConnection = null;
    });
    this.pendingConnection = tracked;
    return tracked;
  }

  async connectCredential(
    credential: string,
    validateCredential: ValidateCredential,
  ): Promise<void> {
    // A direct credential is an explicit replacement and supersedes an OAuth
    // window that may still be open in another popup.
    this.generation += 1;
    const generation = this.generation;
    const validated = await validateCredential(credential);
    if (generation !== this.generation) {
      throw new Error("OpenRouter connection was cancelled.");
    }

    await this.storeCredential(validated);
    if (generation !== this.generation) {
      await this.clearCredential();
      throw new Error("OpenRouter connection was cancelled.");
    }
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    await this.clearCredential();
  }
}
