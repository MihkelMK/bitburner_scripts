import { fileListFile, cleanArgs, repoListFile, getArgValue, getCurrentDirectory } from "/gitburner/lib.js"

/** @type {NS} ns */
let ns

/** @param {NS} ns **/
export async function main(ns_) {
    ns = ns_
    let args = cleanArgs(ns.args)
    if (args < 1) {
        ns.tprint("Repository not provided")
        return
    }
    let repoList = ns.read(repoListFile)
    /** @type {Object.<string, string>} */
    let repos = {}
    if (repoList != '') repos = JSON.parse(repoList)
    let repoData = args[0].split("/")
    let author = repoData.at(0)
    let repo = repoData.at(1)
    if (author == undefined || repo == undefined) {
        ns.tprint("Invalid repository")
        return
    }
    // let branchIndex = ns.args.findIndex((a) => a == "-b" || a == "--branch")
    // let branch = (branchIndex == -1) ? "main" : ns.args[branchIndex + 1]
    let branch = getArgValue(ns.args, "main", "branch", "b")
    let repoKey = branch + "@" + args[0]
    let path = ""
    if (Object.keys(repos).includes(repoKey)) {
        path = repos[repoKey]
    } else {
        let path = args.at(1)
        let currentDir = getCurrentDirectory()
        if (path == undefined && currentDir != null) {
            path = currentDir
        } else {
            ns.tprint("No path provided")
            return
        }
        path = ("/" + path + "/").replace("//", "/")
        // await downloadFiles({author: "kotakotik22", repo: "BitBurnerGithubTest", branch: "main"})\
        repos[repoKey] = path
        await ns.write(repoListFile, JSON.stringify(repos), "w")
    }
    await downloadFiles({ author, repo, branch }, path)
}

/**
 * @param {Branch} branch
 * @param {string} path
 */
export async function downloadFiles(branch, path) {
    let names = await getFileNames(branch)
    for (let file of names) {
        ns.tprint(("/" + path + file).replace("//", "/"))
        await ns.write(("/" + path + file).replace("//", "/"), await githubRequest({ path: file, branch }), "w")
    }
}
/** 
 * @param {Branch} branch 
 * @return {Promise<string[]>}
*/
async function getFileNames(branch) {
    let response = await githubRequest({
        path: fileListFile,
        branch
    })
    if (response == null) {
        ns.tprint("Could net get file names")
        throw response
    }
    try {
        let data = JSON.parse(response)
        let incorrentFiles = data.filter(f => typeof (f) != 'string'
            || (!f.endsWith(".txt") && !f.endsWith(".js") && !f.endsWith(".script")))
        if (Object.getPrototypeOf(data) != Array.prototype || incorrentFiles.length > 0) {
            ns.tprint("File list is not an array or it contains incorrect paths")
            if (incorrentFiles.length > 0) {
                ns.tprint(`Incorrect paths: ${incorrentFiles}`)
            }
            return
        }
        data.push(fileListFile)
        return data
    } catch (error) {
        ns.tprint("Could not parse file list!")
        throw error
    }
}

/**
 * @param {Handle} handle
 * @return {Promise<string?>}
 */
async function githubRequest(handle) {
    let p = "https://raw.githubusercontent.com/" + [handle.branch.author, handle.branch.repo, handle.branch.branch, handle.path].join("/")
    let response = await fetch(p)
        .then(response => response.text())
    if (response == "404: Not Found") {
        ns.print("Could not fetch " + p)
        return null
    }
    ns.print("Successfully fetched " + p)
    return response
}