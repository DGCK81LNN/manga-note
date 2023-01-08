/// <reference path="./types.ts" />

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @param {new () => T} [_type=HTMLElement]
 * @returns {T}
 */
function $$$(id, _type) {
  return document.getElementById(id)
}

if (typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = () =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => {
        try {
          resolve(new TextDecoder().decode(r.result))
        } catch (err) {
          reject(err)
        }
      }
      r.onerror = () => {
        reject(r.error)
      }
      r.readAsArrayBuffer()
    })
}

/**
 * @param {MouseEvent} ev
 * @param {HTMLElement} $el
 */
function getMouseXY(ev, $el) {
  const { left, top, width, height } = $el.getBoundingClientRect()
  const x = ev.clientX
  const y = ev.clientY
  return [((x - left) / width) * 100, ((y - top) / height) * 100]
}

/**
 * @param {Data} data
 * @param {number} pageIndex
 */
function getImgSrc(data, pageIndex) {
  if (pageIndex < 0 || pageIndex >= data.pageCount) return ""
  return `https://${host}/img-master/img/${data.path}/${data.id}_p${pageIndex}_master1200.jpg`
}

const defaultHost = "i.pixiv.cat"
const preloadPages = [-1, 1, 2, 3]

/** @type {Data} */
let data = null

let host = defaultHost
let pageIndex = 0
let editMode = false
/** @type {Set<Note>} */
let noteSet = null
/** @type {PageView} */
let pageView = null
/** @type {NoteView} */
let editingNoteView = null

class GlobalListener {
  /**
   * @param {Parameters<typeof EventTarget.prototype.addEventListener>} args
   */
  constructor(...args) {
    document.addEventListener(...args)
    this.args = args
  }
  remove() {
    document.removeEventListener(...this.args)
  }
}

class PageView {
  /**
   * @param {Data} data
   * @param {number} pageIndex
   */
  constructor(data, pageIndex) {
    this.data = data
    this.pageIndex = pageIndex
    this.active = true

    this.$wrap = document.createElement("div")
    this.$wrap.className = "page"
    this.$wrap.style.animation = "0.25s fade-in"

    this.$image = document.createElement("img")
    this.$wrap.appendChild(this.$image)
    this.$image.className = "page-image"
    this.$image.draggable = false

    this.$preloaders = []
    for (let i = preloadPages.length; i > 0; --i) {
      this.$preloaders.push(new Image())
    }

    for (const note of noteSet) {
      if (note.page === pageIndex) new NoteView(this, note)
    }

    this.x = 0
    this.y = 0
    this.w = 0
    this.h = 0
    this.mousePressed = false
    this.isNewNote = false
    this.resizing = false
    /** @type {NoteView} */
    this.resizingNoteView = null

    this.$image.onerror = ev => {
      if (!this.active) return
      if (confirm("Image failed to load, retry?")) this.loadImg()
    }
    this.$wrap.onmousedown = this.$wrap.ontouchstart = ev => {
      if (!this.active) return
      if (!editMode || (ev instanceof MouseEvent && ev.button !== 0)) return
      ;[this.x, this.y] = getMouseXY(ev, this.$wrap)
      this.mousePressed = true
      this.isNewNote = !this.resizingNoteView
    }
    this.$wrap.onmousemove = this.$wrap.ontouchmove = ev => {
      if (!this.active) return
      if (!editMode || !this.mousePressed) return
      const [x2, y2] = getMouseXY(ev, this.$wrap)
      this.w = x2 - this.x
      this.h = y2 - this.y
      if (this.w === 0 || this.h === 0) return

      if (this.resizing) {
        const w = Math.abs(this.w) < 10 ? Math.sign(this.w) * 10 : this.w
        const h = Math.abs(this.h) < 10 ? Math.sign(this.h) * 10 : this.h
        this.resizingNoteView.resize(w, h)
      } else if (Math.abs(this.w) >= 10 && Math.abs(this.h) >= 10) {
        this.resizing = true
        if (this.resizingNoteView) {
          const note = this.resizingNoteView.note
          note.x = this.x
          note.y = this.y
        } else {
          /** @type {Note} */
          const note = {
            page: this.pageIndex,
            x: this.x,
            y: this.y,
            w: this.w,
            h: this.h,
            text: "",
          }
          noteSet.add(note)
          this.resizingNoteView = new NoteView(this, note)
        }
        this.resizingNoteView.startResize()
      }
    }
    this._$_mouseUp = new GlobalListener(
      "mouseup",
      (this.$wrap.ontouchend = ev => {
        if (!this.active) return
        this.mousePressed = false
        this.resizing = false
        if (this.resizingNoteView) {
          this.resizingNoteView.endResize()
          if (this.isNewNote) this.resizingNoteView.startEdit()
        }
        this.resizingNoteView = null
      })
    )

    this.loadImg()
    $$$("main").appendChild(this.$wrap)
  }

  loadImg() {
    if (!this.data) return
    if (this.$image.naturalWidth && this.$image.complete) return

    const pn = this.pageIndex
    this.$image.src = getImgSrc(this.data, pn)

    this.$preloaders.forEach(($preloader, i) => {
      $preloader.src = getImgSrc(this.data, pn + preloadPages[i])
    })
  }

  bye() {
    this.active = false
    this._$_mouseUp.remove()
    setTimeout(() => {
      this.$wrap.remove()
    }, 300)
  }
}

class NoteView {
  /**
   * @param {PageView} pageView
   * @param {Note} note
   */
  constructor(pageView, note) {
    this.pageView = pageView
    this.note = note

    this.$el = document.createElement("div")
    this.$el.className = "note"
    this.$el.NoteView = this
    this.$el.onclick = () => {
      if (editMode) this.startEdit()
    }

    this.update()
    pageView.$wrap.appendChild(this.$el)
  }

  update() {
    let { x, y, w, h, text } = this.note
    if (w < 0) {
      x += w
      w *= -1
    }
    if (h < 0) {
      y += h
      h *= -1
    }
    this.$el.style.cssText = `left: ${x}%; top: ${y}%; width: ${w}%; height: ${h}%;`
    this.$el.textContent = text
  }

  /**
   * @param {number} w
   * @param {number} h
   */
  resize(w, h) {
    this.note.w = w
    this.note.h = h
    this.update()
  }

  startResize() {
    this.$el.classList.add("note-editing")
  }
  endResize() {
    this.$el.classList.remove("note-editing")
    if (this.note.w < 0) {
      this.note.x += this.note.w
      this.note.w *= -1
    }
    if (this.note.h < 0) {
      this.note.y += this.note.h
      this.note.h *= -1
    }
  }

  startEdit() {
    editingNoteView = this
    $$$("editbox").value = this.note.text
    bootstrap.Modal.getOrCreateInstance("#editModal").show()
  }

  delete() {
    noteSet.delete(this.note)
    this.$el.remove()
  }
}

/** @param {Blob | Response | Promise<Blob | Response>} source */
async function loadData(source) {
  try {
    source = await source

    if (source instanceof Response && !source.ok)
      throw `Error response: ${source.status} ${source.statusText}`

    const json = await source.text()
    data = JSON.parse(json)
  } catch (err) {
    alert("An error occurred while loading the data.\n" + err)
    return
  }
  initialize()
}

function initialize() {
  const somethingLoaded = data && data.id
  $$$("modal-artworkinfo").hidden = !somethingLoaded
  if (somethingLoaded) {
    $$$("source").textContent = `Pixiv artwork #${data.id}`
    $$$("source").href = data.id && `https://pixiv.net/artworks/${data.id}`
    $$$("artist").textContent = data.artist || "?"
    $$$("artist").href =
      data.artistId && `https://pixiv.net/users/${data.artistId}`
    $$$("desc").textContent = data.description || ""

    if (data.notes) {
      noteSet = new Set(data.notes)
      data.notes = null
    }
  } else {
    noteSet = new Set()
  }

  pageIndex = 0
  showPage()
}

function showPage() {
  if (pageView) pageView.bye()
  pageView = new PageView(data, pageIndex)
  $$$("pageno").textContent = data
    ? `${pageIndex + 1}/${data.pageCount}`
    : "Nothing loaded"
}

function prevPage() {
  if (data && pageIndex > 0) {
    pageIndex--
    showPage()
  }
}
function nextPage() {
  if (data && pageIndex < data.pageCount - 1) {
    pageIndex++
    showPage()
  }
}
$$$("pageup").onclick = prevPage
$$$("pagedown").onclick = nextPage
document.onwheel = ev => {
  if (ev.deltaY > 0) return nextPage()
  if (ev.deltaY < 0) return prevPage()
}
document.onkeydown = ev => {
  if (ev.key === "ArrowUp" || ev.key === "PageUp") return prevPage()
  if (ev.key === "ArrowDown" || ev.key === "PageDown") return nextPage()
}

$$$("pageno").onclick = function () {
  if (!data || !data.id) return

  Object.assign($$$("gotobox"), {
    value: pageIndex + 1,
    max: data.pageCount
  })
  $$$("goto-max").textContent = "/" + data.pageCount
  bootstrap.Modal.getOrCreateInstance("#gotoModal").show()
}
$$$("gotoModal").addEventListener("shown.bs.modal", function () {
  $$$("gotobox").focus()
})
$$$("gotoform").onsubmit = function (ev) {
  ev.preventDefault()
  pageIndex = $$$("gotobox").valueAsNumber - 1
  showPage()
  bootstrap.Modal.getOrCreateInstance("#gotoModal").hide()
}

{
  const key = "mangaNoteProxyHost"
  host = localStorage.getItem(key) || defaultHost

  const $host = $$$("host", HTMLInputElement)
  $host.placeholder = defaultHost
  $host.value = host
  $host.onchange = function () {
    host = this.value
    if (pageView) pageView.loadImg()
    localStorage.setItem(key, host)
  }
}

$$$("editswitch").onchange = function () {
  editMode = this.checked
  $$$("editops").hidden = !editMode
}

$$$("editModal").addEventListener("shown.bs.modal", function () {
  $$$("editbox").focus()
})
$$$("editbox").onkeydown = function (ev) {
  if (ev.key === "Enter" && ev.ctrlKey && !ev.shiftKey && !ev.altKey)
    $$$("editsave").click()
}

$$$("editmove").onclick = function () {
  editingNoteView.startResize()
  editingNoteView.pageView.resizingNoteView = editingNoteView
  bootstrap.Modal.getOrCreateInstance("#editModal").hide()
}
$$$("editdelete").onclick = function () {
  if (
    (editingNoteView.note.text || $$$("editbox").value) &&
    !confirm("Really delete this note?")
  )
    return
  editingNoteView.delete()
  bootstrap.Modal.getOrCreateInstance("#editModal").hide()
}
$$$("editsave").onclick = function () {
  editingNoteView.note.text = $$$("editbox").value
  editingNoteView.update()
}

$$$("metabtn").onclick = function () {
  if (!data) data = {}
  $$$("meta-id").value = data.id || ""
  $$$("meta-path").value = data.path || ""
  $$$("meta-pagecount").value = data.pageCount || ""
  $$$("meta-artist").value = data.artist || ""
  $$$("meta-artistid").value = data.artistId || ""
  $$$("meta-description").value = data.description || ""
  bootstrap.Modal.getOrCreateInstance("#modal").hide()
  bootstrap.Modal.getOrCreateInstance("#metaModal").show()
}
$$$("metaform").onsubmit = function (ev) {
  ev.preventDefault()
  data.id = $$$("meta-id").value
  data.path = $$$("meta-path").value
  data.pageCount = $$$("meta-pagecount").value
  data.artist = $$$("meta-artist").value
  data.artistId = $$$("meta-artistid").value
  data.description = $$$("meta-description").value
  bootstrap.Modal.getOrCreateInstance("#metaModal").hide()
  initialize()
}
$$$("metaModal").addEventListener("hidden.bs.modal", function () {
  bootstrap.Modal.getOrCreateInstance("#modal").show()
})

$$$("exportbtn").onclick = function () {
  if (!data || !data.id) return alert("Cannot export, nothing is loaded")

  data.notes = [...noteSet]
  const json = JSON.stringify(data)
  data.notes = null

  const blob = new File([json], `${data.id}.json`)
  const url = URL.createObjectURL(blob)
  const $link = document.createElement("a")
  $link.href = url
  $link.download = blob.name
  $link.click()

  setTimeout(URL.revokeObjectURL, 600000, url)
}

$$$("clearbtn").onclick = function () {
  if (!noteSet.size) return alert("No notes")

  if (!confirm("Really delete all notes?")) return
  noteSet.clear()
  showPage()
}

$$$("openbtn").onclick = function () {
  const $input = document.createElement("input")
  $input.type = "file"
  $input.accept = ".json,application/json"
  $input.onchange = () => {
    loadData($input.files[0])
  }
  $input.click()
}

{
  const $modals = $$$("modals")
  $modals.onkeydown = $modals.onwheel = function (ev) {
    ev.stopPropagation()
  }
}

!function () {
  const search = new URLSearchParams(location.search)
  if (search.has("id")) {
    const id = search.get("id")
    if (id !== String(parseInt(id)))
      return alert("Invalid id in URL parameter")

    const path = `./data/${id}.json`
    loadData(fetch(path))
  }
}()

initialize()
bootstrap.Modal.getOrCreateInstance("#modal").show()
