# The pod image: Playwright's Ubuntu image (Chromium and its libraries), Node 24, the GitHub Actions runner and the two
# scripts below. Built by `.github/workflows/gpu-image.yml` on a push to main that changes this folder, and again on the
# 1st of each month so the runner never goes stale. `gpu.yml` pins the result by digest.
FROM mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579

# The runner release, with the checksum measured from the release's own tarball (the Editors repo's pod measured the same one).
ARG RUNNER_VERSION=2.338.2
ARG RUNNER_SHA256=baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40
LABEL org.automata.runner-version=${RUNNER_VERSION}

USER root
# Node 24 runs the repo's TypeScript scripts as they are. playwright-core is installed here, outside the change under test.
COPY --from=node:24.21.0-bookworm-slim /usr/local/bin/node /usr/local/bin/node
RUN npm install --global --prefix /usr/local --no-audit --no-fund playwright-core@1.65.1 \
 && curl -fsSL -o /tmp/runner.tgz "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
 && echo "${RUNNER_SHA256}  /tmp/runner.tgz" | sha256sum -c - \
 && mkdir -p /opt/actions-runner && tar xzf /tmp/runner.tgz -C /opt/actions-runner && rm /tmp/runner.tgz \
 && /opt/actions-runner/bin/installdependencies.sh \
 && mkdir -p /opt/ax /run/ax \
 && chown -R pwuser:pwuser /opt/actions-runner /run/ax

COPY entrypoint.sh /usr/local/bin/ax-entrypoint
COPY job-started.sh /opt/ax/job-started.sh
RUN chmod 0755 /usr/local/bin/ax-entrypoint /opt/ax/job-started.sh

ENTRYPOINT ["/usr/local/bin/ax-entrypoint"]
