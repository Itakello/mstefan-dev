# The deploy host only pulls the image CI built from Dockerfile.build for this commit.
ARG OPENSHIP_COMMIT_SHA
FROM ghcr.io/itakello/mstefan-dev:${OPENSHIP_COMMIT_SHA}
