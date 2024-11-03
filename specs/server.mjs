import express from "express";
import { networkInterfaces } from "node:os";
import fs from "node:fs";

import passKit from "passkit-generator";
const { PKPass } = passKit;

/**
 * @type {Record<string, { address: string }[]>}
 */

const IPV4Interfaces = {};

for (const [ifName, netIf] of Object.entries(networkInterfaces())) {
	if (!netIf?.length) {
		continue;
	}

	for (let i = 0; i < netIf.length; i++) {
		const netInterface = netIf[i];
		const isIPv4 = netInterface.family == "IPv4";
		const isLoopback = netInterface.address === "127.0.0.1";

		const isSuitable = isIPv4 && !isLoopback && !netInterface.internal;

		if (isSuitable) {
			IPV4Interfaces[ifName] = IPV4Interfaces[ifName] || [];
			IPV4Interfaces[ifName].push(netInterface);
		}
	}
}

const app = express();

app.listen(3500, "0.0.0.0", function () {
	console.log(`Listening`);
});

app.get("/health", (_, reply) => {
	reply.status(200).send({ status: "OK" });
	return;
});

/**
 * @type {Record<string, string>}
 */

const AIRPORTS = {
	VCE: "Venice Marco Polo Airport",
	AMS: "Amsterdam Airport Schipol",
	MUC: "Munich Airport",
	FRA: "Frankfurt Airport",
	LAX: "Los Angeles International Airport",
	DXB: "Dubai International Airport",
	IAD: "Dulles International Airport",
	HND: "Haneda Airport",
	LHR: "Heathrow Airport",
	MEL: "Melbourne Airport",
	ZRH: "Zurich Airport",
};

/**
 * @param {string} [current]
 * @returns {string}
 */

function getRandomAirport(current = "") {
	const list = Object.keys(AIRPORTS);

	let selected = current;

	while (selected === current || !selected) {
		selected = list[Math.floor(Math.random() * (list.length - 0 + 1) + 0)];
	}

	return selected;
}

let lastUpdate = Date.now();

/**
 * @param {object} [modifications]
 * @return {Promise<passKit.PKPass>}
 */

async function createPass(
	modifications,
	serialNumber = String(Math.random() * 100),
) {
	const pass = await PKPass.from(
		{
			model: "../passkit-generator/examples/models/exampleBooking.pass",
			certificates: {
				signerCert: fs.readFileSync(
					"../passkit-generator/certificates/signerCert.pem",
				),
				signerKey: fs.readFileSync(
					"../passkit-generator/certificates/signerKey.pem",
				),
				wwdr: fs.readFileSync("../passkit-generator/certificates/WWDRG4.pem"),
				signerKeyPassphrase: "123456",
			},
		},
		{
			serialNumber,
			webServiceURL: `http://${
				Object.entries(IPV4Interfaces)[0][1][0].address
			}:3500`,
			authenticationToken: "mimmomimmoqgeqwyidukqq",
			voided: false,
			...modifications,
		},
	);

	pass.transitType = "PKTransitTypeAir";

	const departureAirport = getRandomAirport();
	const arrivalAirport = getRandomAirport(departureAirport);

	pass.primaryFields.push({
		key: "Departure",
		label: AIRPORTS[departureAirport],
		value: departureAirport,
	});

	pass.primaryFields.push({
		key: "Destination",
		label: AIRPORTS[arrivalAirport],
		value: arrivalAirport,
		changeMessage: "Destination airport changed to %@",
	});

	pass.setExpirationDate(null);
	pass.setRelevantDate(null);
	pass.setLocations(null);

	return pass;
}

app.get("/testpass", async (_, response) => {
	const pass = await createPass();

	lastUpdate = Date.now();

	response
		.header("Content-Type", pass.mimeType)
		.header("Content-Disposition", `attachment; filename="pass.pkpass"`)
		.header("Last-Modified", new Date().toUTCString())
		.status(200)
		.send(pass.getAsBuffer());
});

app.use(
	(await import("../lib/middlewares/v1/log.js")).default({
		onIncomingLogs(logs) {
			console.group("Logs received");
			console.log(logs);
			console.groupEnd();
			console.log("=========================");
		},
	}),
);

app.use(
	(await import("../lib/middlewares/v1/registration.js")).default({
		async onRegister(
			deviceLibraryIdentifier,
			passTypeIdentifier,
			serialNumber,
			pushToken,
		) {
			console.group("RECEIVED REGISTER REQUEST");
			console.log("deviceLibraryIdentifier:", deviceLibraryIdentifier);
			console.log("passTypeIdentifier:", passTypeIdentifier);
			console.log("serialNumber:", serialNumber);
			console.log("pushToken:", pushToken);
			console.groupEnd();
			console.log("=========================");

			return true;
		},
		async onUnregister(
			deviceLibraryIdentifier,
			passTypeIdentifier,
			serialNumber,
		) {
			console.group("RECEIVED UN-REGISTER REQUEST");
			console.log("deviceLibraryIdentifier:", deviceLibraryIdentifier);
			console.log("passTypeIdentifier:", passTypeIdentifier);
			console.log("serialNumber:", serialNumber);
			console.groupEnd();
			console.log("=========================");
		},
		async tokenVerifier(token) {
			console.log("Verifying token", token);
			return true;
		},
	}),
);

app.use(
	(await import("../lib/middlewares/v1/list.js")).default({
		async onListRetrieve(
			deviceLibraryIdentifier,
			passTypeIdentifier,
			{ passesUpdatedSince },
		) {
			console.group("RECEIVED LIST REQUEST");
			console.log("deviceLibraryIdentifier:", deviceLibraryIdentifier);
			console.log("passTypeIdentifier:", passTypeIdentifier);
			console.log("passesUpdatedSince:", passesUpdatedSince);
			console.groupEnd();
			console.log("=========================");

			return {
				serialNumbers: ["askdfgas"],
				lastUpdated: `${Date.now()}`,
			};
		},
	}),
);

app.use(
	(await import("../lib/middlewares/v1/update.js")).default({
		async onUpdateRequest(
			passTypeIdentifier,
			serialNumber,
			modifiedSinceTimestamp,
		) {
			console.group("RECEIVED UPDATE REQUEST");
			console.log("passTypeIdentifier:", passTypeIdentifier);
			console.log("serialNumber:", serialNumber);
			console.log("modifiedSinceTimestamp:", modifiedSinceTimestamp);
			console.groupEnd();
			console.log("=========================");

			if (modifiedSinceTimestamp) {
				console.log(new Date(modifiedSinceTimestamp), new Date(lastUpdate));
			}

			if (modifiedSinceTimestamp && modifiedSinceTimestamp >= lastUpdate) {
				console.log("modifiedSinceTimestamp >= lastUpdate");
				return undefined;
			}

			lastUpdate = Date.now();

			const pass = await createPass(
				{
					voided: true,
					passTypeIdentifier,
				},
				serialNumber,
			);

			return pass.getAsBuffer();
		},
		async tokenVerifier(token) {
			console.log("Verifying token", token);
			return true;
		},
	}),
);