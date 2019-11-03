import 'components-jqueryui/themes/base/jquery-ui.css'
import '../res/main.css'
import mainHtml from '../res/main.html'
import fileSvg from '../res/file.svg'
import dirSvg from '../res/dir.svg'

import $ from 'jquery'
import 'components-jqueryui'
import marked from 'marked'
import * as git from 'isomorphic-git'
import LightningFS from '@isomorphic-git/lightning-fs'

let pfs, gitdir, remote = null, branch, depth

git.plugins.set('emitter', {emit:(type,obj) => {
	if (type === 'message') setmessage(obj)
	else if (type === 'progress') setprogress(obj)
}})

const fileImgUrl = URL.createObjectURL(new Blob([fileSvg], {type:'image/svg+xml'}))
const dirImgUrl = URL.createObjectURL(new Blob([dirSvg], {type:'image/svg+xml'}))

export async function gitview(opts) {
	let url = (new URL(opts.url, window.location.href)).href
	branch = opts.ref || 'master'
	depth = opts.depth || 256
	let fs = new LightningFS(url)
	pfs = fs.promises
	git.plugins.set('fs', fs)
        $(opts.elem || 'body').html(mainHtml)

	setprogress({phase: 'Cloning'})
	console.log(url)

	gitdir = '/'
	try {
		if (opts.mode === 'smart') {
			await git.clone({
				gitdir: gitdir,
				corsProxy: url.indexOf('github.com') >= 0 ? 'https://cors.isomorphic-git.org' : null,
				url: url,
				noGitSuffix: true,
				noCheckout: true,
				singleBranch: true,
				depth: depth,
				ref: branch
			})
			remote = 'origin'
		} else if (opts.mode === 'dumb' || opts.mode === 'dumb-noloose') {
			setprogress({phase: 'Reading HTTP Filesystem'})
			fs = new LightningFS(url+'_httpbacked', {
				wipe: true,
				url: url,
				urlauto: opts.mode !== 'dumb-noloose'
			})
			pfs = fs.promises
			if (opts.mode === 'dumb-noloose') {
				await pfs.backFile('/HEAD')
				await pfs.backFile('/config')
				await pfs.backFile('/packed-refs')
				await pfs.backFile('/objects/info/packs')
				let head = await pfs.readFile('/HEAD')
				await pfs.writeFile('/HEAD', head)
				let refs = await pfs.readFile('/packed-refs')
				await pfs.writeFile('/packed-refs', refs)
			}
			let promises = []
			let config = await pfs.readFile('/config', { encoding: 'utf8' })
			let branches = [...config.matchAll(/\[branch "([^"]*)"\]/g)].map(x=>x[1])
			for (let branch of branches) {
				promises.push((async () => {
					pfs.backFile('/refs/heads/' + branch)
				})().catch(()=>{}))
			}
			let packs = null
			try {
				packs = await pfs.readFile('/objects/info/packs', { encoding: 'utf8' })
			} catch (e) {}
			if (packs) {
				packs = packs.match(/pack-.{40}\.pack/g)
				let i = 0
				for (let pack of packs) {
					promises.push((async () => {
						pfs.backFile('/objects/pack/' + pack)
						await pfs.backFile('/objects/pack/' + pack.slice(0, 45) + '.idx')
						++ i
						setprogress({phase: 'Identifying packfiles', loaded: i, total: packs.length, lengthComputable: true})
					})())
				}
			}
			await Promise.all(promises)
			git.plugins.set('fs', fs)
			setprogress({phase: 'Loading content'})
		} else {
			throw new Error('no valid mode set')
		}
	
		window.git = git
		let oid = await git.resolveRef({gitdir:gitdir,ref:branch})
		let commit = await git.readObject({gitdir:gitdir,oid:oid})
		let log = getCommitSummary(commit)
		$('#lastcommit-log').html('<b>' + log.name + '</b> ' + log.msg)
		$('#lastcommit-id').html('Latest commit ' + oid.slice(0, 7) + ' ' + log.age)
	
		await updatenavpath()
	} catch(e) {
		setprogress({phase: e.code})
		setmessage(e.message)
		return
	}

	console.log(await git.listBranches({gitdir: gitdir, remote: null}))
	console.log(await git.listBranches({gitdir: gitdir, remote: 'origin'}))
}

let updatenavpath = async function(event)
{
	let loc = location.hash
	if (loc) loc = loc.slice(1)
	await navpath(loc)
}
window.onpopstate = updatenavpath

let navpath = async function(dir) {
	let oid = await git.resolveRef({gitdir:gitdir,ref:branch})
	let commit = await git.readObject({gitdir:gitdir,oid:oid})
	let tree = await git.readObject({gitdir:gitdir,oid:commit.oid,filepath:dir})
	let tbody = $('.files #filerows')
	let msgmap = {}
	let msgsleft = tree.object.entries.length
	tbody.empty()
	let fname, fcontent = null
	for (let entry of tree.object.entries) {
		let file = entry.path
		let tr = $('<tr>').addClass('filerow')
		let link = $('<a>').text(file)
		let path = dir ? dir + '/' + file : file
		let icon = $('<img>').attr('height', 16)
		if (entry.type === 'tree') {
			icon.attr('src', dirImgUrl)
			link.attr('href', '#' + path)
		} else {
			icon.attr('src', fileImgUrl)
			let blob = await git.readObject({gitdir:gitdir,oid:entry.oid})
			blob = new Blob([blob.object])
			link.attr('href', URL.createObjectURL(blob))
		}
		$('<td>').addClass('icon').append(icon).appendTo(tr)
		$('<td>').addClass('content').append(link).appendTo(tr)
		msgmap[file] = {
			msg: $('<td>').addClass('message').appendTo(tr),
			age: $('<td>').addClass('age').html('<i>long ago</i>').appendTo(tr)
		}
		if (entry.type === 'tree') {
			tbody.prepend(tr)
		} else {
			tbody.append(tr)
		}
		if (!fcontent && entry.type === 'blob' && file.match(/^(README|index)(\.md(wn)?)?$/)) {
			fname = file
			fcontent = await git.readObject({gitdir:gitdir,oid:entry.oid,encoding:'utf8'})
			fcontent = fcontent.object
		}
	}
	if (dir != '') {
		let link = $('<a>').text('..')
		let path = dir.replace(/\/?[^\/]*$/,'')
		link.attr('href', '#' + path)
		let tr = $('<tr>').addClass('filerow')
		$('<td>').appendTo(tr)
		$('<td>').append(link).appendTo(tr)
		$('<td>').appendTo(tr)
		$('<td>').appendTo(tr)
		tbody.prepend(tr)
	}
	$('#readme-title').empty()
	if (fcontent) {
		$('<h3>').text(fname).appendTo($('#readme-title'))
		$('#readme').html(marked(fcontent))
		$('#readme-elem').show()
	} else {
		$('#readme').empty()
		$('#readme-elem').hide()
	}

	// walk commit history to give each file a message and age
	let nextoids = []
	let histdepth = 0
	while (msgsleft && ++histdepth <= depth) {
		let log = null
		nextoids.push(...commit.object.parent)
		let nextcommit, nexttree
		let nextoid = nextoids.shift()
		let oidtree = {}
		if (nextoid) try {
			nextcommit = await git.readObject({gitdir:gitdir,oid:nextoid})
			nexttree = await git.readObject({gitdir:gitdir,oid:nextcommit.oid,filepath:dir})
			for (let entry of nexttree.object.entries) {
				oidtree[entry.path] = entry.oid;
			}
		} catch (e) {}
		for (let entry of tree.object.entries) {
			if (!(entry.path in msgmap)) {
				continue
			}
			if (entry.path in oidtree && entry.oid === oidtree[entry.path]) {
				continue
			}
			// use commit for this file
			if (!log) log = getCommitSummary(commit)
			msgmap[entry.path].msg.text(log.msg)
			msgmap[entry.path].age.text(log.age)
			delete msgmap[entry.path]
			-- msgsleft
		}
		commit = nextoid && nextcommit
		tree = nextoid && nexttree
		setprogress({phase: 'Walking history', loaded: histdepth, total: depth, lengthComputable: true})
	}
	delprogress()
}

function getCommitSummary(commit)
{
	let log = commit.object
	let msg = log.message
	let line = msg.indexOf('\n')
	if (line >= 0) msg = msg.slice(0, line)
	let time = new Date((log.author.timestamp + log.author.timezoneOffset * 60) * 1000)
	let age = (Date.now() - time.getTime()) / 1000
	let agenum, ageword
	if (age < 60) {
		age = Math.round(age) + ' second'
	} else if (age < 60 * 59.5) {
		age = Math.round(age / 60) + ' minute'
	} else if (age < 60 * 60 * 23.5) {
		age = Math.round(age / (60 * 60)) + ' hour'
	} else if (age < 6.5 * 60 * 60 * 24) {
		age = Math.round(age / (60 * 60 * 24)) + ' day'
	} else if (age < (31 - 4) * 60 * 60 * 24) {
		age = Math.round(age / (60 * 60 * 24 * 7)) + ' week'
	} else if (age < (365.25 - 16) * 60 * 60 * 24) {
		age = Math.round(age / (60 * 60 * 24 * 365.25 / 12)) + ' month'
	} else {
		age = Math.round(age / (365.25 * 60 * 60 * 24)) + ' year'
	}
	if (age.slice(0,2) !== '1 ') age += 's'
	return {
		name: log.author.email.slice(0, log.author.email.indexOf('@')),
		msg: msg,
		age: age + ' ago'
	}
}

let setmessage, setprogress, delprogress
{
	let dialog = null
	let prog = null
	let line = null
	let msg = null
	let init = function() {
		dialog = $('#dialog')
		prog = $('<div>')
		msg = $('<div>')
		dialog.append(msg)
		dialog.append(prog)
		dialog.dialog({
			closeOnEscape: false,
			draggable: false,
			modal: true,
			autoOpen: false,
			resizable: false
		})
		$(':button',dialog[0].parent).hide()
		prog.progressbar()
	}
	setmessage = function(newmsg) {
		console.log(newmsg)
		msg.text(newmsg)
		//$('<p>').text(newmsg).appendTo(msg)
		dialog.dialog('open')
	}
	setprogress = function(pevent) {
		if (!dialog) init()
		dialog.dialog('option', 'title', pevent.phase)
		if (pevent.lengthComputable) {
			prog.progressbar({value:pevent.loaded,max:pevent.total})
		} else {
			prog.progressbar({value:false})
		}
		if (!dialog.dialog('isOpen')) {
			dialog.dialog('open')
		}
	}
	delprogress = function() {
		dialog.dialog('close')
		msg.empty()
	}
}
