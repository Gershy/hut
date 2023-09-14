declare namespace HutRoom_setup_hut {
  export type Hut = Form_cnst<{ Record: HutRoom_record.Record }, {
    init: (props: any) => void;
  }>
  
  export type AboveHut = Form_cnst<{ Hut: Hut }, {
    init: (props: any) => void;
  }>
  
  export type BelowHut = Form_cnst<{ Hut: Hut }, {
    init: (props: any) => void;
  }>
  
  export type Room = {
    Hut: Hut;
    AboveHut: AboveHut;
    BelowHut: BelowHut;
  };
}