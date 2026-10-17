# Release documentation rule

For every `apps-script/Code.gs` change, update both parts of its leading header before handing off the file or deploying it:

1. Set `App version` to the same version as `APP_VERSION`.
2. Add a concise, accurate entry under `CHANGES IN THIS VERSION` describing the change.

Verify the header version, `APP_VERSION`, and the deployment version agree before saying the change is ready.
