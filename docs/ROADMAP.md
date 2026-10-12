# Viora Extension — Project Roadmap

This roadmap describes possible future improvements. Availability depends on what is implemented in each packaged extension version.

## Usability
- [ ] Add a short onboarding flow explaining the available tools and settings.
- [ ] Make provider/model configuration and connection status easy to find.
- [ ] Show helpful errors when a provider is not configured or a request fails.
- [ ] Improve keyboard navigation and screen-reader labels.

## Privacy and security
- [ ] Clearly explain which requests are sent to external AI providers.
- [ ] Keep API keys out of source files, logs, screenshots, and repository history.
- [ ] Request only browser permissions that are needed for the enabled features.
- [ ] Document how conversation history and settings are stored and deleted.

## Reliability
- [ ] Add a repeatable packaging checklist for each release ZIP.
- [ ] Test the unpacked extension in current Chrome and Edge versions.
- [ ] Verify the manifest and permissions before publishing a package.
- [ ] Maintain a version-by-version changelog so users can see what changed.

## Release quality
- [ ] Include a short smoke-test checklist with each release.
- [ ] Document known limitations for each package.
- [ ] Keep screenshots and feature descriptions consistent with the actual build.
