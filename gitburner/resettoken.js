/** @param {NS} ns **/
export async function main(ns) {
    delete localStorage.gitburner_github_token
	ns.tprint("Reset token")
}