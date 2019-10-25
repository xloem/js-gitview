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
		gitdir: '/',
		corsProxy: 'https://cors.isomorphic-git.org',
		url: 'https://github.com/isomorphic-git/isomorphic-git',
		ref: 'master',
		singleBranch: true,
		noCheckout: true,
		depth: 10
	})
	delprogress()
	updatenavpath()
}

async function updatenavpath(event)
{
	let loc = window.location.href
	let idx = loc.indexOf('#')
	if (idx === -1) loc = ''
	else loc = loc.slice(idx + 1)
	await navpath(loc)
}

async function navpath(dir) {
	let oid = await git.resolveRef({gitdir:'/',ref:'HEAD'})
	let tree = await git.readObject({gitdir:'/',oid:oid,filepath:dir})
	let tbody = $('tbody#files')
	tbody.empty()
	let readme = null
	for (let entry of tree.object.entries) {
		let file = entry.path
		let tr = $('<tr>')
		let link = $('<a>').text(file)
		let path = dir ? dir + '/' + file : file
		if (entry.type === 'tree') {
			link.attr('href', '#' + path)
		} else {
			let blob = await git.readObject({gitdir:'/',oid:entry.oid})
			blob = new Blob([blob.object])
			link.attr('href', URL.createObjectURL(blob))
		}
		link.appendTo($('<td>')).appendTo(tr)
		//let log = await git.log({gitdir: '/', dir: path, depth: 1})
		//log = log[0].message
		//let line = log.indexOf('\n')
		//if (line >= 0) log = log.slice(0, line)
		//$('<td>').text(log).appendTo(tr)
		if (entry.type === 'tree') {
			tbody.prepend(tr)
		} else {
			tbody.append(tr)
		}
		if (file === 'README.md') {
			readme = await git.readObject({gitdir:'/',oid:entry.oid,encoding:'utf8'})
			readme = readme.object
		}
	}
	if (dir != '') {
		let link = $('<a>').text('..')
		let path = dir.replace(/\/?[^\/]*$/,'')
		link.attr('href', '#' + path)
		let tr = $('<tr>')
		link.appendTo($('<td>')).appendTo(tr)
		tbody.prepend(tr)
	}
	if (readme) {
		$('#readme').html(marked(readme))
	} else {
		$('#readme').empty()
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
		msg.text(newmsg)
		//$('<p>').text(newmsg).appendTo(msg)
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
