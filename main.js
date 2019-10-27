let gitview

{
let pfs, gitdir

git.plugins.set('emitter', {emit:(type,obj) => {
	if (type === 'message') setmessage(obj)
	else if (type === 'progress') setprogress(obj)
}})

gitview = async function(opts) {
	pfs = opts.fs.promises
	git.plugins.set('fs', opts.fs)
	//make_structure(opts.elem || $('body'))
	setprogress({phase: 'Cloning'})
	console.log(opts.url)
	let id = (await git.hashBlob({object:opts.url})).oid
	gitdir = '/' + id
	await git.clone({
		gitdir: gitdir,
		corsProxy: opts.url.indexOf('github.com') >= 0 ? 'https://cors.isomorphic-git.org' : null,
		url: opts.url,
		ref: opts.ref || 'master',
		singleBranch: true,
		noCheckout: true,
		depth: 1
	})
	delprogress()

	let log = await git.log({gitdir: gitdir, depth: 1})
	log = log[0]
	let logname = log.author.email.slice(0, log.author.email.indexOf('@'))
	let logmsg = log.message
	let logline = logmsg.indexOf('\n')
	if (logline >= 0) logmsg = logmsg.slice(0, logline)
	$('#lastcommit-log').html('<b>' + logname + '</b> ' + logmsg)
	let logid = log.oid.slice(0, 7)
	let logtime = new Date((log.author.timestamp + log.author.timezoneOffset * 60) * 1000)
	$('#lastcommit-id').html('Latest commit ' + logid + ' on ' + logtime.toDateString())

	updatenavpath()
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
	let readme = null
	for (let entry of tree.object.entries) {
		let file = entry.path
		let tr = $('<tr>').addClass('filerow')
		let link = $('<a>').text(file)
		let path = dir ? dir + '/' + file : file
		let icon = $('<img>').attr('height', 16)
		if (entry.type === 'tree') {
			icon.attr('src', 'folder.svg')
			link.attr('href', '#' + path)
		} else {
			icon.attr('src', 'file.svg')
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
		if (file === 'README.md') {
			readme = await git.readObject({gitdir:gitdir,oid:entry.oid,encoding:'utf8'})
			readme = readme.object
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
	if (readme) {
		$('<h3>').text('README.md').appendTo($('#readme-title'))
		$('#readme').html(marked(readme))
		$('#readme-elem').show()
	} else {
		$('#readme-title').empty()
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

}
