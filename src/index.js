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

let pfs, gitdir, remote = null, branch

git.plugins.set('emitter', {emit:(type,obj) => {
	if (type === 'message') setmessage(obj)
	else if (type === 'progress') setprogress(obj)
}})

const fileImgUrl = URL.createObjectURL(new Blob([fileSvg], {type:'image/svg+xml'}))
const dirImgUrl = URL.createObjectURL(new Blob([dirSvg], {type:'image/svg+xml'}))

export async function gitview(opts) {
	let url = (new URL(opts.url, window.location.href)).href
	branch = opts.ref || 'master'
	let fs = new LightningFS(url)
	pfs = fs.promises
	git.plugins.set('fs', fs)
        $(opts.elem || 'body').html(mainHtml)
	//make_structure(opts.elem || $('body'))
	setprogress({phase: 'Cloning'})
	console.log(url)
	//let id = (await git.hashBlob({object:opts.url})).oid
	gitdir = '/'// + id
	try {
		if (opts.mode === 'smart') {
			await git.clone({
				gitdir: gitdir,
				corsProxy: url.indexOf('github.com') >= 0 ? 'https://cors.isomorphic-git.org' : null,
				url: url,
				noGitSuffix: true,
				noCheckout: true,
				singleBranch: true,
				depth: 16,
				ref: opts.ref || 'master'
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
			let packs = null
			try {
				packs = await pfs.readFile('/objects/info/packs', { encoding: 'utf8' })
			} catch (e) {}
			if (packs) {
				packs = packs.match(/pack-.{40}\.pack/g)
				let promises = []
				let i = 0
				for (let pack of packs) {
					promises.push(new Promise(async (resolve, reject) => {
						try {
							pfs.backFile('/objects/pack/' + pack)
							await pfs.backFile('/objects/pack/' + pack.slice(0, 45) + '.idx')
						} catch(e) {
							reject(new Error('Missing packfile: ' + pack))
						}
						++ i
						setprogress({phase: 'Identifying packfiles', loaded: i, total: packs.length, lengthComputable: true})
						resolve()
					}))
				}
				await Promise.all(promises)
			}
			git.plugins.set('fs', fs)
			setprogress({phase: 'Loading content'})
		} else {
			throw new Error('no valid mode set')
		}
	
		let log = await git.log({gitdir: gitdir, depth: 1})
	        branch = (await git.currentBranch({ gitdir: gitdir })) || 'HEAD'
		log = log[0]
		let logname = log.author.email.slice(0, log.author.email.indexOf('@'))
		let logmsg = log.message
		let logline = logmsg.indexOf('\n')
		if (logline >= 0) logmsg = logmsg.slice(0, logline)
		$('#lastcommit-log').html('<b>' + logname + '</b> ' + logmsg)
		let logid = log.oid.slice(0, 7)
		let logtime = new Date((log.author.timestamp + log.author.timezoneOffset * 60) * 1000)
		$('#lastcommit-id').html('Latest commit ' + logid + ' on ' + logtime.toDateString())
	
		await updatenavpath()
		delprogress()
	} catch(e) {
		setprogress({phase: e.code})
		setmessage(e.message)
		return
	}

	console.log(await git.listBranches({gitdir: gitdir, remote: null}))
	console.log(await git.listBranches({gitdir: gitdir, remote: 'origin'}))
}

/*
let filerows, readme_elem, readme_title, readme_body

let make_structure = function(root) {
	let maincont = $('<div>').addClass('main-container')
	let main = $('<div>').addClass('main-elem').appendTo(maincont)
	let head = $('<div>').addClass('elem-head').appendTo(
	let body = $('<div>').addClass('elem-body').appendTo(filesmain)
	let table = $('<div>')
}
*/

let updatenavpath = async function(event)
{
	let loc = location.hash
	if (loc) loc = loc.slice(1)
	await navpath(loc)
}
window.onpopstate = updatenavpath

let navpath = async function(dir) {
	let oid = await git.resolveRef({gitdir:gitdir,ref:'HEAD'})
	let tree = await git.readObject({gitdir:gitdir,oid:oid,filepath:dir})
	let tbody = $('.files #filerows')
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
		//let log = await git.log({gitdir: gitdir, depth: 1})
		//log = log[0].message
		//let line = log.indexOf('\n')
		//if (line >= 0) log = log.slice(0, line)
		//$('<td>').text(log).appendTo(tr)
		$('<td>').addClass('message').appendTo(tr)
		$('<td>').addClass('age').appendTo(tr)
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
