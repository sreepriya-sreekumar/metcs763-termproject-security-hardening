FROM node:18-alpine

WORKDIR /app

# Copy dependency files first
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copy everything else including the entrypoint script
COPY . .

# Ensure entrypoint.sh has execute permission inside the image
RUN chmod +x /app/entrypoint.sh

ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
