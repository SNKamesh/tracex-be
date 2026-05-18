# Use a lightweight Linux image with Node.js pre-installed
FROM node:18-slim

# Install Ghostscript using the Linux package manager
RUN apt-get update && apt-get install -y ghostscript && rm -rf /var/lib/apt/lists/*

# Set up our working app directory inside the container
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of your backend source files
COPY . .

# Expose port 3000 for web traffic
EXPOSE 3000

# Start the Node server
CMD ["node", "index.js"]