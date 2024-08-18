FROM node:19
WORKDIR /usr/src/solarquant
COPY package*.json ./

RUN npm install

RUN apt update && apt install podman -y

COPY . .
RUN npm run build && npm install -g .

ENTRYPOINT ["sqc"]
