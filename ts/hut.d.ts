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