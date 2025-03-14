import * as state from ".."
let str=state.observable({a:1})

str.a.set(3)
console.log(str.diy())
console.log(str.get())
