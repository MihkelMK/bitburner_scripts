import { getCurrentDirectory, addToFileList } from "/gitburner/lib.js"

let jsTemplate = `/** @param {NS} ns **/
export async function main(ns) {
    
}`

/** @type {Object.<string, string>} */
let fileTypes = {
	"js": jsTemplate,
	"txt": "",
	"script": ""
}

/** @param {NS} ns **/
export async function main(ns) {
	if (ns.args.length < 1) {
		ns.tprint("File name required")
		return
	}
	let file = ns.args[0].toString()
	let type = Object.keys(fileTypes).find(t => file.endsWith("." + t))
	if (type == undefined) {
		file += ".txt"
		type = "txt"
	}
	let template = fileTypes[type]
	let path = (getCurrentDirectory() + "/" + file).replace("//", "/")
	await ns.write(path, template, "w")
	await addToFileList(ns, getCurrentDirectory() + "/", file)
	ns.tprint(`Created file ${file} and added it to the file list`)
}