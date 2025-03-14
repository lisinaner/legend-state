import * as state from ".."
let str=state.observable({a:1})
let im=str.diy()
str.a.set(3)

console.log(str.get())
console.log(im)
