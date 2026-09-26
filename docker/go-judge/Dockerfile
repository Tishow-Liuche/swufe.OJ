FROM criyle/go-judge:latest

# The image ships mount.yaml, so -tmp-fs-param alone does not resize /w.
# Capacity is on-demand, not reserved RAM; container memory limits still apply.
RUN sed -i '/target: \/w/{n;s/size=128m,nr_inodes=4k/size=2g,nr_inodes=64k/;}' /opt/mount.yaml \
    && sed -n '/target: \/w/{n;p;}' /opt/mount.yaml | grep -q 'size=2g,nr_inodes=64k'

# Install compilers and runtimes (Debian base)
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    g++ gcc make \
    python3 \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN g++ --version && python3 --version
