fn main() {
    // Declare our application commands in the app manifest so tauri-build
    // generates per-command permissions (e.g. `allow-store-auth-token`). Without
    // this, app commands have NO permission identifier, so a capability cannot
    // grant one to a remote origin — which is exactly why the twinme-auth-bridge
    // capability's `allow-store-auth-token` reference failed to resolve.
    //
    // NOTE: `commands()` RESTRICTS the invokable set to this list, so it must
    // name every command registered in `generate_handler!` (lib.rs). Keep the
    // two lists in sync. The remote capability still grants only
    // `store_auth_token` to twinme.me; the rest stay local-only.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "hide_hummingbird",
                "open_main_window",
                "open_route",
                "store_auth_token",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
