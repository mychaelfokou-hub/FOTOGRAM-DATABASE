const swaggerAutogen = require('swagger-autogen')({openapi: '3.0.4'}) //autogenerate swagger config file

const doc = { //swagger config skeleton, with bearer auth scheme
	info: {
		title: 'Fotogram API',
		description: 'API del social media Fotogram'
	},
	host: 'localhost:3000',
	components: {
		securitySchemes:{
			bearerAuth: {
				type: 'http',
				scheme: 'bearer'
			}
		}
	}
};

const outputFile = './swagger-output.json'; //save config here
const routes = ['./endpoints.js']; //inject these endpoints in the above file

swaggerAutogen(outputFile, routes, doc); //autogenerate config