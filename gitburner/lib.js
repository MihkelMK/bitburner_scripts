export const fileListFile = "files.txt"
export const repoListFile = "/gitburner/repos.txt"

/** 
 * @param {(string|number)[]} args
 * @return {(string|number)[]}
 */
export function cleanArgs(args) {
	let n = []
	let skipNext = false
	for (let arg of args) {
		if (skipNext) {
			skipNext = false
			continue
		}
		if (arg.toString().startsWith("-")) {
			skipNext = true
		} else n.push(arg)
	}
	return n
}

/**
 * @param {(string|number)[]} args
 * @param {string} name
 * @param {string} char
 * @param {string|number} defaultt
 * @return {(string|number)?}
 */
export function getArgValue(args, defaultt, name, char) {
	let index = args.findIndex((a) => a == `-${char}` || a == `--${name}`)
	return (index == -1) ? defaultt : args[index + 1]
}

// thanks phil
/**
 * @return {string?}
 */
export function getCurrentDirectory() {
	return eval("document").querySelector('.MuiFormControl-root p')?.innerText?.match?.(/~(.*)\]/)?.[1]
}

/**
 * @param {NS} ns
 * @param {string} path
 * @param {string} file
 */
export async function addToFileList(ns, path, file) {
	if (!path.endsWith(fileListFile)) path += fileListFile
	/** @type {string[]} */
	let files = []
	if (ns.fileExists(path)) files = JSON.parse(ns.read(path))
	if (!files.includes(file)) {
		files.push(file)
		await ns.write(path, JSON.stringify(files), "w")
	}
}

let clientId = "Iv1.ab446b9855d9388c"

/** @param {NS} ns */
export async function main(ns) {
	ns.tprint("This script is not meant to be directly ran, the main function is here for testing")
	let code = await getCode()
	ns.tprint(code.verification_uri)
	ns.tprint(code.user_code)
	ns.tprint(await waitForAuth(ns, code))
}

/**
 * @param {NS} ns
 * @return {Promise<AuthToken|string>} Authentication token if successful, error description otherwise
 */
export async function requestAuth(ns) {
	let code = await getCode()
	ns.tprint(`
	Install the GitBurner app: (you only have to do this once per account)
	   https://github.com/apps/gitburner-bitburner

	To authenticate, go to:
	   ${code.verification_uri}
	And enter the code
	   ${code.user_code}
	We will automatically proceed once you have accepted

	TODO: add link to a page explaining how to add a permament token`)
	return await waitForAuth(ns, code)
}

/**
 * @param {NS} ns
 * @return {Promise<string|null>}
 */
export async function getTokenOrAuth(ns) {
	if (localStorage.gitburner_github_token == undefined) {
		let auth = await requestAuth(ns)
		if (typeof (auth) == "string") {
			ns.tprint(auth)
			return null
		}
		// ns.tprint(auth.scope)
		return "token " + auth.access_token
	} else {
		return "token " + localStorage.gitburner_github_token
	}
}

/**
 * @param {GithubCode} code
 * @param {NS} ns
 * @return {Promise<string|AuthToken>}
 */
async function waitForAuth(ns, code) {
	while (true) {
		await ns.sleep((1 + code.interval) * 1000)
		let response = await (await fetch(`https://github.com/login/oauth/access_token?client_id=${clientId}&device_code=${code.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`, {
			method: "POST",
			headers: new Headers({
				"Accept": "application/json"
			}),
		})).json()
		if (!response.error) return response
		switch (response.error) {
			case "authorization_pending":
				continue
			default:
				return `\nError "${response.error}" recieved while trying to authenticate:\n${response.error_description}\n\n${response.error_uri}`
		}
	}
}

/**
 * @return {Promise<GithubCode>}
 */
async function getCode() {
	return await (await fetch(`https://github.com/login/device/code?client_id=${clientId}`, {
		method: "POST",
		headers: new Headers({
			"Accept": "application/json"
		})
	})).json()
}

/**
 * @typedef {{access_token: string, token_type: string, scope: string}} AuthToken
 */

/**
 * @typedef GithubCode
 * @property {string} device_code
 * @property {string} user_code
 * @property {string} verification_uri
 * @property {number} expires_in
 * @property {number} interval
 */

/**
 * Represents a branch on a specific repo
 * @typedef {{author: string, repo: string, branch: string}} Branch
 */