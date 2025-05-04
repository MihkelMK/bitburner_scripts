import { fileListFile, repoListFile, cleanArgs, getArgValue, getCurrentDirectory, getTokenOrAuth } from "/gitburner/lib.js"

/** @type {NS} ns */
let ns

/** @param {NS} ns **/
export async function main(ns_) {
    ns = ns_
    let args = cleanArgs(ns.args)
    let currentDir = getCurrentDirectory()
    if (args < 1 && currentDir == null) {
        ns.tprint("Repository not provided")
        return
    }
    let repoList = ns.read(repoListFile)
    /** @type {Object.<string, string>} */
    let repos = {}
    if (repoList != '') repos = JSON.parse(repoList)
    let repoData = args[0]?.split("/")
    let author = repoData?.at(0)
    let repo = repoData?.at(1)
    let branch = getArgValue(ns.args, "main", "branch", "b")
    if ((author == undefined || repo == undefined) && currentDir != null) {
        let key = Object.keys(repos).find((p) => repos[p] == currentDir + "/")
        if(key == undefined) {
            ns.tprint("Could not find repository at current directory")
            return
        }
        repoData = key.split("@")[1].split("/")
        author = repoData[0]
        repo = repoData[1]
        branch = key.split("@")[0]
    } else {
        ns.tprint("Invalid repository")
        return
    }
    let repoKey = branch + "@" + repoData.join("/")
    if (!Object.keys(repos).includes(repoKey)) {
        ns.tprint(`Could not find ${repoKey}`)
        return
    }
    ns.print(`Pushing to ${repoKey}`)
    await push({ author, repo, branch }, getArgValue(ns.args, undefined, "message", "m"), repos[repoKey])
    // await push({author: "kotakotik22", repo: "BitBurnerGithubTest", branch: "main"})
}

/**
 * @param {string} path
 * @param {RequestInit} options
 * @return {Promise<Response>}
 */
function apiRequest(path, options = undefined) {
    let p = "https://api.github.com/" + path
    ns.print("Making API request to path " + p)
    return fetch(p, options)
}

/**
 * @param {Branch} branch
 * @param {string?} message
 * @param {string} path
 */
export async function push(branch, message, path) {
    // TODO: split up into multiple functions
    let tree = []
    let token = await getTokenOrAuth(ns)
    if(token == null) {
        ns.tprint("Could not get token!")
        return 
    }
    let auth = new Headers({
                // "Authorization": `token ${localStorage.gitburner_github_token}`
                "Authorization": token
            })
    for (let file of JSON.parse(ns.read((path + fileListFile).replace("//", "/")))) {
        let p = `repos/${branch.author}/${branch.repo}/contents/${file}`
        let response = await (await apiRequest(`${p}?ref=${branch.branch}`)).json()
        let content = btoa(ns.read((path + file).replace("//", "/")).trim())
        // so much redundad atob/btoa but im lazy so idc c:
        if (response.content != null && atob(response.content.trim()) == atob(content)) {
            ns.print(`Not updating file ${file} because it has not been changed`)
            continue
        }
        tree.push({
            path: file,
            mode: "100644",
            type: "blob",
            content: atob(content)
        })
    }
    if(tree.length < 1) {
        ns.tprint("No files were updated")
        return
    }
    let latestCommit = (await (await apiRequest(`repos/${branch.author}/${branch.repo}/git/ref/heads/${branch.branch}`)).json())
    let newTree = await (await apiRequest(`repos/${branch.author}/${branch.repo}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
            tree,
            base_tree: latestCommit.object.sha
        }),
        headers: auth
    })).json()
    let commit = await apiRequest(`repos/${branch.author}/${branch.repo}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
            message: (message == null ? `Update ${tree.length} files` : message) + "\n\nAutomatically committed by GitBurner",
            tree: newTree.sha,
            parents: [latestCommit.object.sha]
        }),
        headers: auth
    })
    let commitResp = await commit.text()
    let push = await apiRequest(`repos/${branch.author}/${branch.repo}/git/refs/heads/${branch.branch}`, {
        method: "PATCH",
        body: JSON.stringify({
            sha: JSON.parse(commitResp).sha
        }),
        headers: auth
    })
    if(push.status == 200) {
        ns.tprint(`Done! Updated ${tree.length} files`)
        ns.print(commitResp)
    } else {
        ns.tprint("Push unsuccessful \nStatus code: " + push.status + "\nResponse: " + await push.text())
    }
    // TODO: delete files that have been deleted locally
}