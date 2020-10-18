FROM node:current-alpine

COPY package.json .
COPY package-lock.json .

RUN npm install

COPY . .

EXPOSE 4322

ENTRYPOINT ["node", "app.js"]
