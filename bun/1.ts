import * as state from ".."
let str=state.observable('light')


state.observe(()=>{
 console.log(str.get())
})

str.set('dark')
