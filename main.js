window.fs = new LightningFS('fs')
window.pfs = window.fs.promises
git.plugins.set('fs', window.fs)

window.gitevents = new EventTarget()
git.plugins.set('emitter', {emit:(type,obj) => {
	if (type === 'message') setmessage(obj)
	else if (type === 'progress') setprogress(obj)
}})

window.onpopstate = updatenavpath

async function main() {
	setprogress({phase: 'Cloning'})
	await git.clone({
		dir: '/',
		corsProxy: 'https://cors.isomorphic-git.org',
		url: 'https://github.com/isomorphic-git/isomorphic-git',
		ref: 'master',
		singleBranch: true,
		depth: 10
	})
	delprogress()
	//console.log(await git.resolveRef({ref:'HEAD'}))
	updatenavpath()
}

async function updatenavpath(event)
{
	let loc = window.location.href
	let idx = loc.indexOf('#')
	if (idx === -1) loc = '/'
	else loc = loc.slice(idx + 1)
	await navpath(loc)
}

async function navpath(dir) {
	let tbody = $('tbody#files')
	tbody.empty()
	if (dir != '/') {
		let link = $('<a>').text('..')
		let path = dir.replace(/\/[^\/]*\/$/,'/')
		link.attr('href', '#' + path)
		let tr = $('<tr>')
		link.appendTo($('<td>')).appendTo(tr)
		tbody.append(tr)
	}
	for (let file of await pfs.readdir(dir)) {
		if (file[0] == '.') continue
		let tr = $('<tr>')
		let link = $('<a>').text(file)
		let path = dir + file
		if ((await pfs.stat(path)).type === 'dir') {
			link.attr('href', '#' + path + '/')
		} else {
			let blob = new Blob([await pfs.readFile(path)])
			link.attr('href', URL.createObjectURL(blob))
		}
		link.appendTo($('<td>')).appendTo(tr)
		let log = await git.log({dir: path, depth: 1, ref: 'master'})
		log = log[0].message
		let line = log.indexOf('\n')
		if (line >= 0) log = log.slice(0, line)
		$('<td>').text(log).appendTo(tr)
		tbody.append(tr)
	}
}

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
	function setmessage(newmsg) {
		console.log(newmsg)
		$('<p>').text(newmsg).appendTo(msg)
		dialog.dialog('open')
	}
	function setprogress(pevent) {
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
	function delprogress() {
		dialog.dialog('close')
		msg.empty()
	}
}
