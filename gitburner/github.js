import { cleanArgs } from "/gitburner/lib.js"

let operations = {
	"get": "read.js",
	"push": "write.js",
	"touch": "touch.js"
}

/** @param {NS} ns **/
export async function main(ns) {
	/** @type {(number|string)[]} */
    let args = cleanArgs(ns.args)
	let op = args[0]
	let opArgs = [...ns.args]
	opArgs.shift()
	let toExec = operations[op?.toLowerCase?.()]
	if(toExec == undefined) {
		ns.tprint(`There is no operation "${op}", available: ${Object.keys(operations).map(o => `"${o}"`).join(", ")}`)
		return
	}
	ns.run("/gitburner/" + toExec, 1, ...opArgs)
}