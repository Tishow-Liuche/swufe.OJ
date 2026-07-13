FROM criyle/go-judge:latest

# Install compilers and runtimes (Debian base)
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ gcc make \
    python3 \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN g++ --version && python3 --version
