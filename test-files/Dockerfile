FROM ubuntu:latest

# 1. ADD instruction best practice (dockerfile-add-instruction)
ADD myfile.txt /app/myfile.txt

# 2. curl to shell RCE risk (dockerfile-curl-sh)
RUN curl -sSL http://example.com/install.sh | bash

# 3. Exposing SSH port 22 (dockerfile-expose-ssh)
EXPOSE 22

# 4. USER root permission risk (dockerfile-root-user)
USER root

CMD ["/app/run.sh"]
