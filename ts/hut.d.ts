/// <reference path="./room/record.d.ts"/>
/// <reference path="./room/setup.hut.d.ts"/>
/// <reference path="./nodejs/parse.ts"/>

// Utils
type Only<Props, Pattern extends string> = Omit<Props, keyof Omit<Props, Pattern>>;

// Forms
type FormProto = { init: (args: any) => void };
type FormSupers = { [key: string]: Form_cnst<FormSupers, any> };

// Form constructor
type Form_cnst<Supers extends FormSupers = {}, Props extends FormProto = FormProto, InstanceProps extends {} = any> = {
  new (): Form_inst<Supers, Props, InstanceProps>,
  (): Form_inst<Supers, Props, InstanceProps>,
} | MapConstructor | SetConstructor;

// Form instance
type Form_inst<Supers extends FormSupers = {}, Props extends FormProto = FormProto, InstanceProps extends {} = any> = {
  [key in keyof Props]: Props[key]
};

// Extensible
type Room_mapping = {
  'setup.hut': HutRoom_setup_hut.Room,
  'record': HutRoom_record.Room,
};

// global.form
type FormFn_config_Form<Props> = Only<Props, `$${string}`>;

type FormFn_config<Supers extends { [key: string]: Form_cnst<Supers, Props> }, Props extends FormProto> = {
  name: string,
  has?: FormSupers,
  props: (
    forms?: { [S in keyof Supers]: { [K in keyof Supers[S]]: Supers[S][K] extends Form_cnst<any, infer SProps> ? SProps : never } },
    Form?: FormFn_config_Form<Props>
  ) => Props
};
declare const form: <Supers extends FormSupers, Props extends FormProto>(config: FormFn_config<Supers, Props>) => Form_cnst<Supers, Props>;

// global.Endable
type Endable_props = {
  init: (fn?: () => void) => void,
  onn: () => boolean,
  off: () => boolean,
  end: () => boolean,
}
declare const Endable: Form_cnst<{}, Endable_props>;

// global.getForm
declare const getForm: <Supers extends FormSupers, Props extends FormProto>(item: Form_inst<Supers, Props>) => Form_cnst<Supers, Props>;

// global.getFormName
declare const getFormName: (item: any) => string;

// global.isForm
declare const isForm: (inst: any, form: Form_cnst) => boolean;

// global.denumerate
declare const denumerate: (inst: Form_inst, prop: string) => void;

// global.getMs
declare const getMs: () => number;

// `global.rooms`
declare const rooms: {
  [key in keyof Room_mapping]: () => Promise<Room_mapping[key]>
};

// `global.getRoom`
declare const getRoom: {
  <RoomName extends keyof Room_mapping>(name: RoomName): Promise<Room_mapping[RoomName]>
};

// `global.getRooms`
declare const getRooms: <RoomNames extends keyof Room_mapping>(rooms: RoomNames[]) => Promise<{
  [RoomName in RoomNames]: Room_mapping[RoomName]
}>;

// `global.global`
declare const global: {
  rooms: typeof rooms,
};


// "HUT PRIMITIVES"

type Obj = { [key: string]: any };
type Fun<Return=any> = Fun0<Return>;
type Fun0<Return=any> = (...a: any[]) => Return;
type Fun1<A1, Return=any> = (a1: A1, ...a: any[]) => Return;
type Fun2<A1, A2, Return=any> = (a1: A1, a2: A2, ...a: any[]) => Return;
type Fun3<A1, A2, A3, Return=any> = (a1: A1, a2: A2, a3: A3, ...a: any[]) => Return;
type Fun4<A1, A2, A3, A4, Return=any> = (a1: A1, a2: A2, a3: A3, a4: A4, ...a: any[]) => Return;
type Fun5<A1, A2, A3, A4, A5, Return=any> = (a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, ...a: any[]) => Return;


// PROTOTYPE EXTENSIONS

interface ObjectConstructor {
}
interface Object {
  empty: () => boolean,
  has: (k: string) => boolean,
  map: (fn: (val: any, key: string) => any) => any,
  mapk: (fn: (val: any, key: string) => [ string, any ]) => any,
  at: (k: string | string[], def?: any) => any,
  plain: (obj?: any) => any,
  slice: <T>(this: T, keys: (keyof T)[]) => Partial<T>,
  omit: <T>(this: T, keys: (keyof T)[]) => Partial<T>,
  toArr: <T extends (v: any, k: string) => any>(fn: T) => ReturnType<T>[],
  built: () => Object,
  merge: <T>(val: T) => Object & T,
  gain: (...args: any[]) => any,
  [Symbol.iterator]: () => Iterator<[ string, any]>
}

interface Array<T> {
  any: (fn: Fun) => boolean,
  has: (val: T) => boolean,
  add: (val: T) => void,
  count: () => number,
  valSort: (fn: (val: T) => number) => Array<T>,
  each: (fn: (val: T) => void) => void,
  empty: () => boolean,
  equals: <Z>(arr: Array<T>) => Z extends T ? boolean : false,
  toObj: (fn: Fun) => any,
  seek: (fn: (val: T) => any) => { found: boolean, val: T | undefined, ind: number },
}
interface ArrayConstructor {
  stub: any[]
}

interface Error {
  mod: (props: { [key: string]: any }) => Error
  propagate: (props?: { [key: string]: any }) => never
}

// GLOBALS

declare var safe: any;
