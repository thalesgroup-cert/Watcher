# searx-docker

From this repository: https://github.com/searx/searx-docker
Modified for Watcher project needs.

## What is included?

| Name | Description | Docker image | Dockerfile |
| -- | -- | -- | -- |
| [Searx](https://github.com/asciimoo/searx) | searx by itself | [searx/searx:latest](https://hub.docker.com/r/searx/searx) | [Dockerfile](https://github.com/searx/searx/blob/master/Dockerfile) |
| [Searx-checker](https://github.com/searx/searx-checker) | Check which engines return results of the instance.<br>JSON result available at<br>```https://{SEARX_HOSTNAME}/status```<br>Automatically updated every 24h | [searx/searx-checker:latest](https://hub.docker.com/r/searx/searx-checker) | [Dockerfile](https://github.com/searx/searx-checker/blob/master/Dockerfile) |

## Multi Architecture Docker images

For now only the amd64 platform is supported.