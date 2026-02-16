# NPM Trusted Publishing Setup Guide

## Problem

The autodeploy workflow is failing with the following error:
```
npm error code ENEEDAUTH
npm error need auth This command requires you to be logged in to https://registry.npmjs.org/
npm error need auth You need to authorize this machine using `npm adduser`
```

## Root Cause

The GitHub Actions workflow is correctly configured for NPM trusted publishing (OIDC), but the **iobroker.wled package on npmjs.org is not yet configured to accept trusted publishing from GitHub Actions**.

## Solution

You need to configure NPM trusted publishing on npmjs.org for the `iobroker.wled` package. This is a one-time setup that must be done by a package maintainer with publish permissions.

### Step-by-Step Setup

1. **Log in to npmjs.com** with an account that has publish permissions for `iobroker.wled`

2. **Navigate to the package settings**
   - Go to https://www.npmjs.com/package/iobroker.wled
   - Click on "Settings" tab
   - Click on "Publishing Access" in the sidebar

3. **Configure Trusted Publishing**
   - Look for the "Automated Publishing" or "Trusted Publishers" section
   - Click "Add trusted publisher" or similar button
   - Select "GitHub Actions" as the provider

4. **Enter GitHub Repository Details**
   - **Repository owner**: `DrozmotiX`
   - **Repository name**: `ioBroker.wled`
   - **Workflow name**: `test-and-release.yml` (or the full path: `.github/workflows/test-and-release.yml`)
   - **Environment name**: Leave empty (not using deployment environments)

5. **Save the configuration**
   - Review the settings
   - Click "Save" or "Add" to confirm

### Verification

After configuration, the next tag push should work correctly. You can verify the setup by:

1. Creating a test tag (e.g., `v0.9.2-test`)
2. Pushing it to trigger the workflow
3. Checking that the deploy job succeeds and publishes to npm

### What Changed

The GitHub workflow in this repository is **already correctly configured**:
- ✅ Permissions include `id-token: write` for OIDC
- ✅ No `npm-token` parameter (uses trusted publishing)
- ✅ Uses `ioBroker/testing-action-deploy@v1` action

The only missing piece is the configuration on npmjs.org itself.

### Reference

- **Official NPM documentation**: https://docs.npmjs.com/generating-provenance-statements#using-third-party-package-publishing-tools
- **Working example**: The `ioBroker.discovergy` package is already configured and working correctly with trusted publishing (see workflow run from Feb 15, 2026: https://github.com/DrozmotiX/ioBroker.discovergy/actions/runs/22041127864)

### Success Indicators

When properly configured, you'll see these messages in the deploy job logs:
```
npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=XXXXXXX
```

## Alternative: Using NPM Token (Not Recommended)

If trusted publishing cannot be configured for some reason, you can fall back to using an NPM token:

1. Create an automation token on npmjs.com (User Settings → Access Tokens)
2. Add it as a GitHub secret named `NPM_TOKEN`
3. Update `.github/workflows/test-and-release.yml` to include the npm-token parameter:
   ```yaml
   - uses: ioBroker/testing-action-deploy@v1
     with:
       node-version: '20.x'
       npm-token: ${{ secrets.NPM_TOKEN }}  # Add this line
       github-token: ${{ secrets.GITHUB_TOKEN }}
   ```

However, **NPM tokens expire after 90 days**, so trusted publishing is strongly preferred for long-term maintainability.
