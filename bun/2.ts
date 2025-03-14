import * as state from ".."
let str=state.observable({})

str.get().a=1
console.log(str.get())