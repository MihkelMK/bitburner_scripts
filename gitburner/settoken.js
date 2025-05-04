/** @param {NS} ns **/
export async function main(ns) {
    localStorage.gitburner_github_token = ns.args[0]
	ns.tprint("Set GitHub token to " + ns.args[0])
}