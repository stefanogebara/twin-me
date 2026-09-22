/**
 * The one corner of the Chrome extension API the app touches: handing the access token to
 * the TwinMe extension when it is installed (useExtensionSync, OAuthCallback). Declared here
 * instead of pulling in @types/chrome for two calls.
 */
declare namespace chrome {
  /* Both may be absent: a browser without the API, or one where the extension is not installed. */
  const runtime: {
    sendMessage?: (extensionId: string, message: unknown, responseCallback?: (response: unknown) => void) => void;
    lastError?: { message?: string };
  } | undefined;
}
