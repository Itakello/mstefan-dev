# The deploy host only pulls the image CI built for this exact commit; the build
# itself needs more memory than the host allows. See Dockerfile.build.
ARG OPENSHIP_COMMIT_SHA
FROM ghcr.io/itakello/mstefan-dev:${OPENSHIP_COMMIT_SHA}
